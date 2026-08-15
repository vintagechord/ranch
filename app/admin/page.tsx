import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdminAuthenticated, isAdminConfigured } from "@/lib/adminAuth";
import {
  getOpenChatSettings,
  normalizeOpenChatUrl,
  setOpenChatUrl,
  type OpenChatSettings
} from "@/lib/openChat";
import {
  addPiggyBankAmount,
  getPiggyBankBalance,
  type PiggyBankBalance
} from "@/lib/piggyBank";
import type { ProjectProposalRow } from "@/lib/supabase";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type AdminSearchParams = Promise<{
  error?: string;
  piggy?: string;
  chat?: string;
  proposalPage?: string;
}>;

const PROJECT_PROPOSALS_PER_PAGE = 24;

type ProjectProposalSummary = Pick<
  ProjectProposalRow,
  | "id"
  | "created_at"
  | "artist_name"
  | "project_title"
  | "project_type"
  | "current_stage"
  | "support_needed"
  | "status"
>;

type ReleaseApplicationOverview = {
  total: number;
  latestCreatedAt: string | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul"
  }).format(new Date(value));
}

function formatDateOnly(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeZone: "Asia/Seoul"
  }).format(new Date(value));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0
  }).format(value);
}

function getErrorMessage(error?: string) {
  if (error === "config") {
    return "관리자 비밀번호가 아직 설정되지 않았습니다.";
  }

  if (error === "password") {
    return "비밀번호가 맞지 않습니다.";
  }

  if (error === "rate") {
    return "로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.";
  }

  if (error === "unavailable") {
    return "지금은 관리자 로그인을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.";
  }

  return "";
}

function parsePositivePage(value?: string) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function proposalStatusLabel(status: string) {
  if (status === "reviewing") return "검토 중";
  if (status === "contacted") return "연락 완료";
  if (status === "closed") return "종료";
  return "새 제안";
}

function getPiggyMessage(status?: string) {
  if (status === "saved") {
    return "저금통 금액을 추가했습니다.";
  }

  if (status === "invalid") {
    return "추가할 금액을 1원 이상 정수로 입력해 주세요.";
  }

  if (status === "auth") {
    return "관리자 확인이 필요합니다. 다시 로그인해 주세요.";
  }

  if (status === "error") {
    return "저금통 금액을 저장하지 못했습니다.";
  }

  return "";
}

function getOpenChatMessage(status?: string) {
  if (status === "saved") {
    return "오픈채팅방 링크를 저장했습니다.";
  }

  if (status === "invalid") {
    return "올바른 오픈채팅방 링크를 입력해 주세요.";
  }

  if (status === "auth") {
    return "관리자 확인이 필요합니다. 다시 로그인해 주세요.";
  }

  if (status === "error") {
    return "오픈채팅방 링크를 저장하지 못했습니다.";
  }

  return "";
}

function parsePositiveAmount(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return 0;
  }

  const amount = Number(value.replaceAll(",", "").trim());

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return 0;
  }

  return amount;
}

async function getProjectProposals(page: number) {
  const supabase = getSupabaseAdmin();
  const { error: purgeError } = await supabase.rpc("purge_expired_project_proposals", {});

  if (purgeError) {
    throw new Error(purgeError.message);
  }

  const now = new Date().toISOString();
  const { count, error: countError } = await supabase
    .from("project_proposals")
    .select("id", { count: "exact", head: true })
    .gt("retention_until", now);

  if (countError) {
    throw new Error(countError.message);
  }

  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PROJECT_PROPOSALS_PER_PAGE));

  if (page > pageCount) {
    return {
      items: [] as ProjectProposalSummary[],
      total,
      latestCreatedAt: null,
      outOfRange: true
    };
  }

  const from = (page - 1) * PROJECT_PROPOSALS_PER_PAGE;
  const to = from + PROJECT_PROPOSALS_PER_PAGE - 1;
  const { data, error } = await supabase
    .from("project_proposals")
    .select(
      "id, created_at, artist_name, project_title, project_type, current_stage, support_needed, status"
    )
    .gt("retention_until", now)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(error.message);
  }

  const items = (data ?? []) as ProjectProposalSummary[];
  const { data: latest, error: latestError } = await supabase
    .from("project_proposals")
    .select("created_at")
    .gt("retention_until", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    throw new Error(latestError.message);
  }

  return {
    items,
    total,
    latestCreatedAt: latest?.created_at ?? null,
    outOfRange: false
  };
}

async function getReleaseApplicationOverview(): Promise<ReleaseApplicationOverview> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { count, error: countError } = await supabase
    .from("release_participation_applications")
    .select("id", { count: "exact", head: true })
    .gt("retention_until", now);

  if (countError) {
    throw new Error(countError.message);
  }

  const { data: latest, error: latestError } = await supabase
    .from("release_participation_applications")
    .select("created_at")
    .gt("retention_until", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    throw new Error(latestError.message);
  }

  return {
    total: count ?? 0,
    latestCreatedAt: latest?.created_at ?? null
  };
}

async function savePiggyBankAmount(formData: FormData) {
  "use server";

  const authenticated = await isAdminAuthenticated();

  if (!authenticated) {
    redirect("/admin?piggy=auth");
  }

  const amount = parsePositiveAmount(formData.get("amount"));

  if (!amount) {
    redirect("/admin?piggy=invalid");
  }

  try {
    await addPiggyBankAmount(amount);
  } catch (error) {
    console.error(
      "Piggy bank update failed:",
      error instanceof Error ? error.message : error
    );
    redirect("/admin?piggy=error");
  }

  revalidatePath("/admin");
  redirect("/admin?piggy=saved");
}

async function saveOpenChatUrl(formData: FormData) {
  "use server";

  const authenticated = await isAdminAuthenticated();

  if (!authenticated) {
    redirect("/admin?chat=auth");
  }

  const chatUrlValue = formData.get("chatUrl");
  const chatUrl = typeof chatUrlValue === "string" ? chatUrlValue : "";

  try {
    normalizeOpenChatUrl(chatUrl);
  } catch {
    redirect("/admin?chat=invalid");
  }

  try {
    await setOpenChatUrl(chatUrl);
  } catch (error) {
    console.error(
      "Open chat link update failed:",
      error instanceof Error ? error.message : error
    );
    redirect("/admin?chat=error");
  }

  revalidatePath("/admin");
  redirect("/admin?chat=saved");
}

function AdminLogin({ error }: { error?: string }) {
  const message = getErrorMessage(error);

  return (
    <main className="admin-shell admin-login-shell">
      <section className="admin-login-panel">
        <p className="admin-eyebrow">RANCH ADMIN</p>
        <h1>신청 확인</h1>
        <p>
          신청자 정보가 포함된 화면입니다. 준비팀만 볼 수 있도록 관리자 비밀번호를 입력해
          주세요.
        </p>

        {!isAdminConfigured() ? (
          <div className="admin-alert">
            <code>ADMIN_PASSWORD</code> 환경변수를 설정한 뒤 다시 접속해 주세요.
          </div>
        ) : null}

        {message ? <div className="admin-alert">{message}</div> : null}

        <form className="admin-login-form" action="/api/admin/login" method="post">
          <label>
            <span>관리자 비밀번호</span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button type="submit">들어가기</button>
        </form>

        <Link className="admin-back-link" href="/">
          사이트로 돌아가기
        </Link>
      </section>
    </main>
  );
}

export default async function AdminPage({
  searchParams
}: {
  searchParams: AdminSearchParams;
}) {
  const { error, piggy, chat, proposalPage: proposalPageValue } = await searchParams;
  const authenticated = await isAdminAuthenticated();

  if (!authenticated) {
    return <AdminLogin error={error} />;
  }

  let projectProposals: ProjectProposalSummary[] = [];
  let projectProposalCount = 0;
  let latestProjectProposalCreatedAt: string | null = null;
  let releaseApplicationCount = 0;
  let latestReleaseApplicationCreatedAt: string | null = null;
  let proposalPageOutOfRange = false;
  let piggyBank: PiggyBankBalance = {
    balanceAmount: 0,
    updatedAt: null
  };
  let openChat: OpenChatSettings = {
    chatUrl: null,
    updatedAt: null
  };
  let proposalLoadError = "";
  let piggyLoadError = "";
  let openChatLoadError = "";
  let releaseApplicationLoadError = "";

  try {
    const result = await getProjectProposals(parsePositivePage(proposalPageValue));
    projectProposals = result.items;
    projectProposalCount = result.total;
    latestProjectProposalCreatedAt = result.latestCreatedAt;
    proposalPageOutOfRange = result.outOfRange;
  } catch (adminError) {
    proposalLoadError =
      adminError instanceof Error
        ? adminError.message
        : "프로젝트 제안을 불러오지 못했습니다.";
  }

  try {
    piggyBank = await getPiggyBankBalance();
  } catch (adminError) {
    piggyLoadError =
      adminError instanceof Error
        ? adminError.message
        : "저금통 정보를 불러오지 못했습니다.";
  }

  try {
    openChat = await getOpenChatSettings();
  } catch (adminError) {
    openChatLoadError =
      adminError instanceof Error
        ? adminError.message
        : "오픈채팅방 링크를 불러오지 못했습니다.";
  }

  try {
    const result = await getReleaseApplicationOverview();
    releaseApplicationCount = result.total;
    latestReleaseApplicationCreatedAt = result.latestCreatedAt;
  } catch (adminError) {
    releaseApplicationLoadError =
      adminError instanceof Error
        ? adminError.message
        : "프로젝트 참여 신청 요약을 불러오지 못했습니다.";
  }

  const proposalPage = parsePositivePage(proposalPageValue);
  const proposalPageCount = Math.max(
    1,
    Math.ceil(projectProposalCount / PROJECT_PROPOSALS_PER_PAGE)
  );

  if (!proposalLoadError && proposalPageOutOfRange) {
    redirect(
      proposalPageCount === 1
        ? "/admin#project-proposals"
        : `/admin?proposalPage=${proposalPageCount}#project-proposals`
    );
  }

  const latestCreatedAt = [
    latestProjectProposalCreatedAt,
    latestReleaseApplicationCreatedAt
  ]
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  const piggyMessage = getPiggyMessage(piggy);
  const openChatMessage = getOpenChatMessage(chat);

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <p className="admin-eyebrow">MORNING RANCH / OPERATIONS</p>
          <h1>운영 관리</h1>
        </div>
        <div className="admin-actions">
          <Link href="/">사이트 보기</Link>
          <form action="/api/admin/logout" method="post">
            <button type="submit">로그아웃</button>
          </form>
        </div>
      </header>

      <nav className="admin-workspace-nav" aria-label="프로젝트 참여 관리">
        <Link href="/admin/releases" prefetch={false}>
          <strong>프로젝트 · 참여 파트 관리</strong>
          <span aria-hidden="true">→</span>
          <small>프로젝트 항목, 모집 상태, 참여 크레딧</small>
        </Link>
        <Link href="/admin/release-applications" prefetch={false}>
          <strong>프로젝트 참여 신청</strong>
          <span>{releaseApplicationCount}건</span>
          <small>
            최근 접수 {latestReleaseApplicationCreatedAt
              ? formatDate(latestReleaseApplicationCreatedAt)
              : "-"}
          </small>
        </Link>
      </nav>

      {releaseApplicationLoadError ? (
        <div className="admin-alert">{releaseApplicationLoadError}</div>
      ) : null}

      <section className="admin-summary" aria-label="신청 요약">
        <article>
          <span>프로젝트 제안</span>
          <strong>{projectProposalCount}</strong>
        </article>
        <article>
          <span>프로젝트 참여 신청</span>
          <strong>{releaseApplicationCount}</strong>
        </article>
        <article>
          <span>전체 접수</span>
          <strong>{projectProposalCount + releaseApplicationCount}</strong>
        </article>
        <article>
          <span>최근 신청</span>
          <strong>{latestCreatedAt ? formatDate(latestCreatedAt) : "-"}</strong>
        </article>
      </section>

      {proposalLoadError ? <div className="admin-alert">{proposalLoadError}</div> : null}

      <section id="project-proposals" className="admin-proposal-section" aria-label="프로젝트 제안 목록">
        <div className="admin-table-heading">
          <div>
            <p className="admin-eyebrow">PROJECT PROPOSALS</p>
            <h2>프로젝트 제안</h2>
          </div>
          <span>{proposalPage} / {proposalPageCount} 페이지 · 전체 {projectProposalCount}건</span>
        </div>

        {projectProposals.length === 0 && !proposalLoadError ? (
          <div className="admin-empty">아직 접수된 프로젝트 제안이 없습니다.</div>
        ) : (
          <div className="admin-proposal-grid">
            {projectProposals.map((proposal) => (
              <article className="admin-proposal-card" key={proposal.id}>
                <header>
                  <div className="admin-proposal-badges">
                    <span className="admin-status-badge">{proposalStatusLabel(proposal.status)}</span>
                    <span>{proposal.project_type}</span>
                  </div>
                  <time dateTime={proposal.created_at}>{formatDate(proposal.created_at)}</time>
                </header>

                <div className="admin-proposal-title">
                  <p>{proposal.artist_name}</p>
                  <h3>{proposal.project_title}</h3>
                </div>

                <div className="admin-proposal-tags" aria-label="제안 분류">
                  <span>{proposal.current_stage}</span>
                  {proposal.support_needed.map((support) => <span key={support}>{support}</span>)}
                </div>

                <Link
                  className="admin-proposal-detail-link"
                  href={`/admin/proposals/${proposal.id}`}
                  prefetch={false}
                >
                  제안서 상세 보기 <span aria-hidden="true">→</span>
                </Link>
              </article>
            ))}
          </div>
        )}

        {proposalPageCount > 1 ? (
          <nav className="admin-pagination" aria-label="프로젝트 제안 페이지">
            {proposalPage > 1 ? (
              <Link
                href={proposalPage === 2 ? "/admin#project-proposals" : `/admin?proposalPage=${proposalPage - 1}#project-proposals`}
                prefetch={false}
              >
                ← 이전
              </Link>
            ) : <span aria-hidden="true" />}
            <span>{proposalPage} / {proposalPageCount}</span>
            {proposalPage < proposalPageCount ? (
              <Link
                href={`/admin?proposalPage=${proposalPage + 1}#project-proposals`}
                prefetch={false}
              >
                다음 →
              </Link>
            ) : <span aria-hidden="true" />}
          </nav>
        ) : null}
      </section>

      <section className="admin-piggy-section" aria-label="저금통 관리">
        <div className="admin-piggy-info">
          <p className="admin-eyebrow">PIGGY BANK</p>
          <h2>저금통</h2>
          <dl>
            <div>
              <dt>현재 잔여 금액</dt>
              <dd>{formatCurrency(piggyBank.balanceAmount)}</dd>
            </div>
            <div>
              <dt>업데이트 날짜</dt>
              <dd>{formatDateOnly(piggyBank.updatedAt)}</dd>
            </div>
          </dl>
        </div>

        <form className="admin-piggy-form" action={savePiggyBankAmount}>
          <label>
            <span>추가 금액</span>
            <input
              name="amount"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              placeholder="예: 100000"
              required
            />
          </label>
          <button type="submit">금액 추가</button>
        </form>
      </section>

      {piggyMessage ? <div className="admin-alert">{piggyMessage}</div> : null}
      {piggyLoadError ? <div className="admin-alert">{piggyLoadError}</div> : null}

      <section className="admin-piggy-section admin-open-chat-section" aria-label="오픈채팅방 링크 관리">
        <div className="admin-piggy-info">
          <p className="admin-eyebrow">OPEN CHAT</p>
          <h2>채팅방 링크</h2>
          <dl>
            <div>
              <dt>현재 링크</dt>
              <dd className="admin-link-value">
                {openChat.chatUrl ? (
                  <a href={openChat.chatUrl} target="_blank" rel="noreferrer">
                    {openChat.chatUrl}
                  </a>
                ) : (
                  "-"
                )}
              </dd>
            </div>
            <div>
              <dt>업데이트 날짜</dt>
              <dd>{formatDateOnly(openChat.updatedAt)}</dd>
            </div>
          </dl>
        </div>

        <form className="admin-piggy-form" action={saveOpenChatUrl}>
          <label>
            <span>오픈채팅방 링크</span>
            <input
              name="chatUrl"
              type="url"
              inputMode="url"
              placeholder="https://open.kakao.com/o/..."
              defaultValue={openChat.chatUrl ?? ""}
              required
            />
          </label>
          <button type="submit">링크 저장</button>
        </form>
      </section>

      {openChatMessage ? <div className="admin-alert">{openChatMessage}</div> : null}
      {openChatLoadError ? <div className="admin-alert">{openChatLoadError}</div> : null}
    </main>
  );
}
