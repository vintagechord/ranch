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
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type AdminSearchParams = Promise<{
  error?: string;
  piggy?: string;
  chat?: string;
}>;

type PartyApplication = {
  id: string;
  created_at: string;
  name: string;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  attendees: number | null;
  message: string | null;
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

function formatNullable(value: string | null) {
  return value?.trim() ? value : "-";
}

function getErrorMessage(error?: string) {
  if (error === "config") {
    return "관리자 비밀번호가 아직 설정되지 않았습니다.";
  }

  if (error === "password") {
    return "비밀번호가 맞지 않습니다.";
  }

  return "";
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

async function getApplications() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ranch_applications")
    .select("id, created_at, name, phone, email, instagram, attendees, message")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as PartyApplication[];
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
  const { error, piggy, chat } = await searchParams;
  const authenticated = await isAdminAuthenticated();

  if (!authenticated) {
    return <AdminLogin error={error} />;
  }

  let applications: PartyApplication[] = [];
  let piggyBank: PiggyBankBalance = {
    balanceAmount: 0,
    updatedAt: null
  };
  let openChat: OpenChatSettings = {
    chatUrl: null,
    updatedAt: null
  };
  let loadError = "";
  let piggyLoadError = "";
  let openChatLoadError = "";

  try {
    applications = await getApplications();
  } catch (adminError) {
    loadError =
      adminError instanceof Error
        ? adminError.message
        : "신청 목록을 불러오지 못했습니다.";
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

  const totalAttendees = applications.reduce(
    (sum, item) => sum + Math.max(Number(item.attendees ?? 0), 0),
    0
  );
  const emailCount = applications.filter((item) => item.email?.trim()).length;
  const latestCreatedAt = applications[0]?.created_at;
  const piggyMessage = getPiggyMessage(piggy);
  const openChatMessage = getOpenChatMessage(chat);

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <p className="admin-eyebrow">EULWANGNI EDITION</p>
          <h1>신청 확인</h1>
        </div>
        <div className="admin-actions">
          <Link href="/">사이트 보기</Link>
          <form action="/api/admin/logout" method="post">
            <button type="submit">로그아웃</button>
          </form>
        </div>
      </header>

      <section className="admin-summary" aria-label="신청 요약">
        <article>
          <span>전체 신청</span>
          <strong>{applications.length}</strong>
        </article>
        <article>
          <span>참석 인원</span>
          <strong>{totalAttendees || "-"}</strong>
        </article>
        <article>
          <span>이메일 등록</span>
          <strong>{emailCount}</strong>
        </article>
        <article>
          <span>최근 신청</span>
          <strong>{latestCreatedAt ? formatDate(latestCreatedAt) : "-"}</strong>
        </article>
      </section>

      {loadError ? <div className="admin-alert">{loadError}</div> : null}

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

      <section className="admin-table-section" aria-label="신청 목록">
        <div className="admin-table-heading">
          <h2>신청 목록</h2>
          <span>최신 200건</span>
        </div>

        {applications.length === 0 && !loadError ? (
          <div className="admin-empty">아직 접수된 신청이 없습니다.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>접수</th>
                  <th>이름</th>
                  <th>연락처</th>
                  <th>이메일</th>
                  <th>인스타그램</th>
                  <th>인원</th>
                  <th>메시지</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDate(item.created_at)}</td>
                    <td>
                      <strong>{item.name}</strong>
                    </td>
                    <td>{formatNullable(item.phone)}</td>
                    <td>{formatNullable(item.email)}</td>
                    <td>{formatNullable(item.instagram)}</td>
                    <td>{item.attendees ?? "-"}</td>
                    <td>{formatNullable(item.message)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
