import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import type { ProjectProposalRow } from "@/lib/supabase";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type ProposalDetail = Omit<ProjectProposalRow, "idempotency_key" | "payload_hash">;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul"
  }).format(new Date(value));
}

function formatNullable(value: string | null) {
  return value?.trim() ? value : "-";
}

function statusLabel(status: string) {
  if (status === "reviewing") return "검토 중";
  if (status === "contacted") return "연락 완료";
  if (status === "closed") return "종료";
  return "새 제안";
}

async function getProposal(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }

  const supabase = getSupabaseAdmin();
  const { error: purgeError } = await supabase.rpc("purge_expired_project_proposals", {});

  if (purgeError) {
    throw new Error(purgeError.message);
  }

  const { data, error } = await supabase
    .from("project_proposals")
    .select(
      "id, created_at, contact_name, phone, email, artist_name, project_title, project_type, current_stage, support_needed, desired_schedule, budget_range, reference_url, details, status, privacy_agreed, consented_at, privacy_notice_version, retention_until"
    )
    .eq("id", id)
    .gt("retention_until", new Date().toISOString())
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as ProposalDetail | null;
}

export default async function ProjectProposalDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin");
  }

  const { id } = await params;
  const proposal = await getProposal(id);

  if (!proposal) {
    notFound();
  }

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <p className="admin-eyebrow">PROJECT PROPOSAL / DETAIL</p>
          <h1>제안서 확인</h1>
        </div>
        <div className="admin-actions">
          <Link href="/admin">목록으로</Link>
          <form action="/api/admin/logout" method="post">
            <button type="submit">로그아웃</button>
          </form>
        </div>
      </header>

      <article className="admin-proposal-detail-page">
        <header>
          <div>
            <p>{proposal.artist_name}</p>
            <h2>{proposal.project_title}</h2>
          </div>
          <span className="admin-status-badge">{statusLabel(proposal.status)}</span>
        </header>

        <div className="admin-proposal-tags" aria-label="프로젝트 분류">
          <span>{proposal.project_type}</span>
          <span>{proposal.current_stage}</span>
          {proposal.support_needed.map((support) => <span key={support}>{support}</span>)}
        </div>

        <dl className="admin-proposal-detail-meta">
          <div>
            <dt>접수 일시</dt>
            <dd>{formatDate(proposal.created_at)}</dd>
          </div>
          <div>
            <dt>담당자</dt>
            <dd>{proposal.contact_name}</dd>
          </div>
          <div>
            <dt>이메일</dt>
            <dd><a href={`mailto:${proposal.email}`}>{proposal.email}</a></dd>
          </div>
          <div>
            <dt>연락처</dt>
            <dd>
              {proposal.phone ? <a href={`tel:${proposal.phone}`}>{proposal.phone}</a> : "-"}
            </dd>
          </div>
          <div>
            <dt>희망 일정</dt>
            <dd>{formatNullable(proposal.desired_schedule)}</dd>
          </div>
          <div>
            <dt>예산 범위</dt>
            <dd>{formatNullable(proposal.budget_range)}</dd>
          </div>
          <div>
            <dt>자료 링크</dt>
            <dd>
              {proposal.reference_url ? (
                <a href={proposal.reference_url} target="_blank" rel="noopener noreferrer">링크 열기 ↗</a>
              ) : "-"}
            </dd>
          </div>
          <div>
            <dt>개인정보 동의</dt>
            <dd>{formatDate(proposal.consented_at)} · {proposal.privacy_notice_version}</dd>
          </div>
          <div>
            <dt>보관 만료</dt>
            <dd>{formatDate(proposal.retention_until)}</dd>
          </div>
        </dl>

        <section className="admin-proposal-detail-copy" aria-labelledby="proposal-copy-title">
          <p>PROJECT NOTE</p>
          <h2 id="proposal-copy-title">제안 내용</h2>
          <div>{proposal.details}</div>
        </section>
      </article>
    </main>
  );
}
