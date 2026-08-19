import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getProjectProposals,
  PROJECT_PROPOSALS_PER_PAGE
} from "@/lib/adminOverview.server";
import { isAdminAuthenticated } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ page?: string }>;

function parsePositivePage(value?: string) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul"
  }).format(new Date(value));
}

function proposalStatusLabel(status: string) {
  if (status === "reviewing") return "검토 중";
  if (status === "contacted") return "연락 완료";
  if (status === "closed") return "종료";
  return "새 제안";
}

function pageHref(page: number) {
  return page > 1 ? `/admin/proposals?page=${page}` : "/admin/proposals";
}

export default async function AdminProjectProposalsPage({
  searchParams
}: {
  searchParams: SearchParams;
}) {
  if (!(await isAdminAuthenticated())) redirect("/admin");

  const { page: pageValue } = await searchParams;
  const page = parsePositivePage(pageValue);
  let result;

  try {
    result = await getProjectProposals(page);
  } catch (error) {
    console.error("Project proposal list load failed:", error instanceof Error ? error.message : error);
    return (
      <main className="admin-shell">
        <header className="admin-topbar admin-page-heading">
          <div><p className="admin-eyebrow">MAIN OPERATIONS / INBOX</p><h1>프로젝트 제안</h1></div>
        </header>
        <div className="admin-alert" role="alert">프로젝트 제안을 불러오지 못했습니다.</div>
      </main>
    );
  }

  const pageCount = Math.max(1, Math.ceil(result.total / PROJECT_PROPOSALS_PER_PAGE));
  if (result.outOfRange) redirect(pageHref(pageCount));

  return (
    <main className="admin-shell">
      <header className="admin-topbar admin-page-heading">
        <div>
          <p className="admin-eyebrow">MAIN OPERATIONS / INBOX</p>
          <h1>프로젝트 제안</h1>
          <p>상시 열려 있는 프로젝트 제안 채널의 접수 내용을 확인합니다.</p>
        </div>
      </header>

      <section className="admin-proposal-section" aria-labelledby="project-proposal-list-title">
        <div className="admin-table-heading">
          <div>
            <p className="admin-eyebrow">PROJECT PROPOSALS</p>
            <h2 id="project-proposal-list-title">제안 목록</h2>
          </div>
          <span>{page} / {pageCount} 페이지 · 전체 {result.total}건</span>
        </div>

        {result.items.length === 0 ? (
          <div className="admin-empty">아직 접수된 프로젝트 제안이 없습니다.</div>
        ) : (
          <div className="admin-proposal-grid">
            {result.items.map((proposal) => (
              <article className="admin-proposal-card" key={proposal.id}>
                <header>
                  <div className="admin-proposal-badges">
                    <span className="admin-status-badge">{proposalStatusLabel(proposal.status)}</span>
                    <span>{proposal.project_type}</span>
                  </div>
                  <time dateTime={proposal.created_at}>{formatDate(proposal.created_at)}</time>
                </header>
                <div className="admin-proposal-title">
                  <h3>{proposal.project_title}</h3>
                </div>
                <div className="admin-proposal-tags" aria-label="제안 분류">
                  <span>{proposal.current_stage}</span>
                  {proposal.support_needed.map((support) => <span key={support}>{support}</span>)}
                </div>
                <Link className="admin-proposal-detail-link" href={`/admin/proposals/${proposal.id}`} prefetch={false}>
                  제안서 상세 보기 <span aria-hidden="true">→</span>
                </Link>
              </article>
            ))}
          </div>
        )}

        {pageCount > 1 ? (
          <nav className="admin-pagination" aria-label="프로젝트 제안 페이지">
            {page > 1 ? <Link href={pageHref(page - 1)} prefetch={false}>← 이전</Link> : <span aria-hidden="true" />}
            <span>{page} / {pageCount}</span>
            {page < pageCount ? <Link href={pageHref(page + 1)} prefetch={false}>다음 →</Link> : <span aria-hidden="true" />}
          </nav>
        ) : null}
      </section>
    </main>
  );
}
