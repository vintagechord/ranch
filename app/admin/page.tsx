import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminIntakeOverview } from "@/lib/adminOverview.server";
import { isAdminAuthenticated, isAdminConfigured } from "@/lib/adminAuth";
import { getOpenChatSettings } from "@/lib/openChat";
import { getPiggyBankBalance } from "@/lib/piggyBank";
import {
  getAdminProjects,
  type ConfiguredProject
} from "@/lib/projectSiteSettings.server";

export const dynamic = "force-dynamic";

type AdminSearchParams = Promise<{
  error?: string;
  proposalPage?: string;
  piggy?: string;
  chat?: string;
}>;

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul"
  }).format(new Date(value));
}

function formatDateOnly(value: string | null) {
  if (!value) return "업데이트 전";
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
  if (error === "config") return "관리자 비밀번호가 아직 설정되지 않았습니다.";
  if (error === "password") return "비밀번호가 맞지 않습니다.";
  if (error === "rate") return "로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.";
  if (error === "unavailable") {
    return "지금은 관리자 로그인을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.";
  }
  return "";
}

function AdminLogin({ error }: { error?: string }) {
  const message = getErrorMessage(error);

  return (
    <main className="admin-shell admin-login-shell">
      <section className="admin-login-panel">
        <p className="admin-eyebrow">MORNING RANCH / ADMIN</p>
        <h1>운영실</h1>
        <p>사이트 운영과 신청자 정보가 포함된 화면입니다. 관리자 비밀번호를 입력해 주세요.</p>

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
          <button type="submit">운영실 들어가기</button>
        </form>
        <Link className="admin-back-link" href="/">사이트로 돌아가기</Link>
      </section>
    </main>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: AdminSearchParams }) {
  const params = await searchParams;
  const authenticated = await isAdminAuthenticated();

  if (!authenticated) return <AdminLogin error={params.error} />;

  if (params.proposalPage) {
    const page = Number(params.proposalPage);
    redirect(Number.isSafeInteger(page) && page > 1 ? `/admin/proposals?page=${page}` : "/admin/proposals");
  }

  if (params.piggy || params.chat) {
    const target = new URLSearchParams();
    if (params.piggy) target.set("piggy", params.piggy);
    if (params.chat) target.set("chat", params.chat);
    redirect(`/admin/main?${target.toString()}`);
  }

  let overview = {
    projectProposalCount: 0,
    latestProjectProposalCreatedAt: null as string | null,
    releaseApplicationCount: 0,
    latestReleaseApplicationCreatedAt: null as string | null
  };
  let piggyBank = { balanceAmount: 0, updatedAt: null as string | null };
  let openChat = { chatUrl: null as string | null, updatedAt: null as string | null };
  let configuredProjects: ConfiguredProject[] = [];
  let loadError = "";

  try {
    [overview, piggyBank, openChat, configuredProjects] = await Promise.all([
      getAdminIntakeOverview(),
      getPiggyBankBalance(),
      getOpenChatSettings(),
      getAdminProjects()
    ]);
  } catch (error) {
    console.error("Admin dashboard load failed:", error instanceof Error ? error.message : error);
    loadError = "운영 현황 일부를 불러오지 못했습니다.";
  }

  const latestCreatedAt = [
    overview.latestProjectProposalCreatedAt,
    overview.latestReleaseApplicationCreatedAt
  ]
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
  const activeProjects = configuredProjects.filter((project) => project.lifecycle === "active");

  return (
    <main className="admin-shell admin-dashboard-page">
      <header className="admin-topbar admin-page-heading">
        <div>
          <p className="admin-eyebrow">MORNING RANCH / CONTROL ROOM</p>
          <h1>운영 대시보드</h1>
          <p>메인 운영과 기간형 프로젝트를 분리해 현재 필요한 작업만 확인합니다.</p>
        </div>
      </header>

      {loadError ? <div className="admin-alert" role="alert">{loadError}</div> : null}

      <section className="admin-command-grid" aria-label="관리 영역">
        <Link href="/admin/main" className="admin-command-card is-main">
          <span>ALWAYS ON</span>
          <strong>메인 운영</strong>
          <p>다음 모임, 저금통, 오픈채팅처럼 계속 유지되는 정보를 관리합니다.</p>
          <b aria-hidden="true">→</b>
        </Link>
        <Link href="/admin/projects" className="admin-command-card is-projects">
          <span>{String(activeProjects.length).padStart(2, "0")} ACTIVE</span>
          <strong>프로젝트 관리</strong>
          <p>프로젝트별 작업실에서 참여 파트, 신청, 공개 상태를 관리합니다.</p>
          <b aria-hidden="true">→</b>
        </Link>
      </section>

      <section className="admin-summary" aria-label="접수 요약">
        <article><span>프로젝트 제안</span><strong>{overview.projectProposalCount}</strong></article>
        <article><span>참여 신청</span><strong>{overview.releaseApplicationCount}</strong></article>
        <article><span>활성 프로젝트</span><strong>{String(activeProjects.length).padStart(2, "0")}</strong></article>
        <article><span>최근 접수</span><strong>{formatDate(latestCreatedAt)}</strong></article>
      </section>

      <div className="admin-dashboard-columns">
        <section className="admin-dashboard-panel" aria-labelledby="admin-main-status-title">
          <header>
            <div><p className="admin-eyebrow">MAIN OPERATIONS</p><h2 id="admin-main-status-title">메인 운영 상태</h2></div>
            <Link href="/admin/main">관리하기 →</Link>
          </header>
          <dl className="admin-dashboard-status-list">
            <div><dt>저금통</dt><dd>{formatCurrency(piggyBank.balanceAmount)}</dd><small>{formatDateOnly(piggyBank.updatedAt)}</small></div>
            <div><dt>오픈채팅</dt><dd>{openChat.chatUrl ? "연결됨" : "미설정"}</dd><small>{formatDateOnly(openChat.updatedAt)}</small></div>
            <div><dt>프로젝트 제안</dt><dd>{overview.projectProposalCount}건</dd><small>{formatDate(overview.latestProjectProposalCreatedAt)}</small></div>
          </dl>
        </section>

        <section className="admin-dashboard-panel" aria-labelledby="admin-project-status-title">
          <header>
            <div><p className="admin-eyebrow">PROJECT CHANNELS</p><h2 id="admin-project-status-title">진행 프로젝트</h2></div>
            <Link href="/admin/projects">전체 보기 →</Link>
          </header>
          <div className="admin-dashboard-project-list">
            {activeProjects.map((project) => (
              <Link href={`/admin/projects/${project.slug}`} key={project.slug}>
                <span>{project.number}</span>
                <div><strong>{project.shortTitle}</strong><small>{project.stage}</small></div>
                <b aria-hidden="true">→</b>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
