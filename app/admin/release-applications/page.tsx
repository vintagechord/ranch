import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { getProjectBySlug, projects } from "@/lib/projects";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const ITEMS_PER_PAGE = 24;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const APPLICATION_STATUSES = [
  "new",
  "reviewing",
  "contacted",
  "shortlisted",
  "accepted",
  "declined",
  "withdrawn"
] as const;

type SearchParams = Promise<{
  page?: string;
  status?: string;
  project?: string;
  release?: string;
  role?: string;
}>;

type ReleaseRow = {
  id: string;
  project_slug: string;
  release_number: number;
  title: string;
  artist_name: string;
};

type RoleTypeRow = {
  code: string;
  label_ko: string;
  sort_order: number;
};

type ReleaseRoleRow = {
  id: string;
  release_id: string;
  role_type_code: string;
};

type ApplicationListRow = {
  id: string;
  release_role_id: string;
  applicant_name: string;
  credit_name: string;
  status: string;
  created_at: string;
  status_changed_at: string;
};

type Filters = {
  status: string;
  projectSlug: string;
  releaseId: string;
  roleCode: string;
};

function projectLabel(slug: string) {
  return getProjectBySlug(slug)?.shortTitle ?? slug;
}

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

function statusLabel(status: string) {
  if (status === "new") return "새 신청";
  if (status === "reviewing") return "검토 중";
  if (status === "contacted") return "연락 완료";
  if (status === "shortlisted") return "후보";
  if (status === "accepted") return "참여 확정";
  if (status === "declined") return "미선정";
  if (status === "withdrawn") return "철회";
  return status;
}

function buildListHref(filters: Filters, page: number) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.projectSlug) params.set("project", filters.projectSlug);
  if (filters.releaseId) params.set("release", filters.releaseId);
  if (filters.roleCode) params.set("role", filters.roleCode);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/release-applications?${query}` : "/admin/release-applications";
}

async function loadCatalog() {
  const supabase = getSupabaseAdmin();
  const [releaseResult, roleTypeResult, roleResult] = await Promise.all([
    supabase
      .from("music_releases")
      .select("id, project_slug, release_number, title, artist_name")
      .order("project_slug", { ascending: true })
      .order("release_number", { ascending: true }),
    supabase
      .from("release_role_types")
      .select("code, label_ko, sort_order")
      .order("sort_order", { ascending: true }),
    supabase
      .from("release_roles")
      .select("id, release_id, role_type_code")
  ]);

  const firstError = [releaseResult.error, roleTypeResult.error, roleResult.error].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  return {
    releases: (releaseResult.data ?? []) as ReleaseRow[],
    roleTypes: (roleTypeResult.data ?? []) as RoleTypeRow[],
    roles: (roleResult.data ?? []) as ReleaseRoleRow[]
  };
}

async function loadApplications(page: number, filters: Filters, matchingRoleIds: string[]) {
  const supabase = getSupabaseAdmin();
  const { error: purgeError } = await supabase.rpc(
    "purge_expired_release_participation_applications",
    {}
  );
  if (purgeError) throw new Error(purgeError.message);

  const from = (page - 1) * ITEMS_PER_PAGE;
  const to = from + ITEMS_PER_PAGE - 1;
  let query = supabase
    .from("release_participation_applications")
    .select(
      "id, release_role_id, applicant_name, credit_name, status, created_at, status_changed_at",
      { count: "exact" }
    )
    .gt("retention_until", new Date().toISOString())
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.projectSlug || filters.releaseId || filters.roleCode) {
    query = matchingRoleIds.length > 0
      ? query.in("release_role_id", matchingRoleIds)
      : query.eq("release_role_id", NIL_UUID);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    items: (data ?? []) as ApplicationListRow[],
    total: count ?? 0
  };
}

export default async function AdminReleaseApplicationsPage({
  searchParams
}: {
  searchParams: SearchParams;
}) {
  if (!(await isAdminAuthenticated())) redirect("/admin");

  const params = await searchParams;
  const page = parsePositivePage(params.page);
  const { releases, roleTypes, roles } = await loadCatalog();
  const projectSlug = getProjectBySlug(params.project ?? "")?.slug ?? "";
  const projectReleases = projectSlug
    ? releases.filter((release) => release.project_slug === projectSlug)
    : releases;
  const filters: Filters = {
    status: APPLICATION_STATUSES.includes(params.status as never) ? params.status! : "",
    projectSlug,
    releaseId: projectReleases.some((release) => release.id === params.release) ? params.release! : "",
    roleCode: roleTypes.some((roleType) => roleType.code === params.role) ? params.role! : ""
  };
  const projectReleaseIds = new Set(projectReleases.map((release) => release.id));
  const matchingRoleIds = roles
    .filter(
      (role) =>
        (!filters.projectSlug || projectReleaseIds.has(role.release_id)) &&
        (!filters.releaseId || role.release_id === filters.releaseId) &&
        (!filters.roleCode || role.role_type_code === filters.roleCode)
    )
    .map((role) => role.id);
  const { items, total } = await loadApplications(page, filters, matchingRoleIds);
  const pageCount = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));

  if (page > pageCount) redirect(buildListHref(filters, pageCount));

  const releaseById = new Map(releases.map((release) => [release.id, release]));
  const roleById = new Map(roles.map((role) => [role.id, role]));
  const roleTypeByCode = new Map(roleTypes.map((roleType) => [roleType.code, roleType]));

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <p className="admin-eyebrow">PROJECT PARTICIPATION / APPLICATIONS</p>
          <h1>프로젝트 참여 신청</h1>
          {filters.projectSlug ? <p>{projectLabel(filters.projectSlug)} 프로젝트 신청만 표시합니다.</p> : null}
        </div>
        <div className="admin-actions">
          <Link href="/admin">운영 대시보드</Link>
          <Link href="/admin/projects">프로젝트 목록</Link>
          <form action="/api/admin/logout" method="post">
            <button type="submit">로그아웃</button>
          </form>
        </div>
      </header>

      <div className="admin-management-page">
        <section className="admin-management-section" aria-labelledby="application-list-title">
          <div className="admin-table-heading">
            <div>
              <p className="admin-eyebrow">APPLICATIONS</p>
              <h2 id="application-list-title">신청 목록</h2>
            </div>
            <span>{page} / {pageCount} 페이지 · 전체 {total}건</span>
          </div>

          <form className="admin-filter-form" method="get">
            <label className="admin-form-field">
              <span>프로젝트</span>
              <select name="project" defaultValue={filters.projectSlug}>
                <option value="">전체 프로젝트</option>
                {projects.map((project) => (
                  <option value={project.slug} key={project.slug}>{project.shortTitle}</option>
                ))}
              </select>
            </label>
            <label className="admin-form-field">
              <span>상태</span>
              <select name="status" defaultValue={filters.status}>
                <option value="">전체 상태</option>
                {APPLICATION_STATUSES.map((status) => (
                  <option value={status} key={status}>{statusLabel(status)}</option>
                ))}
              </select>
            </label>
            <label className="admin-form-field">
              <span>프로젝트 항목</span>
              <select name="release" defaultValue={filters.releaseId}>
                <option value="">전체 항목</option>
                {projectReleases.map((release) => (
                  <option value={release.id} key={release.id}>
                    {projectLabel(release.project_slug)} · {release.release_number}. {release.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-form-field">
              <span>참여 파트</span>
              <select name="role" defaultValue={filters.roleCode}>
                <option value="">전체 파트</option>
                {roleTypes.map((roleType) => (
                  <option value={roleType.code} key={roleType.code}>
                    {roleType.label_ko}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">필터 적용</button>
            <Link href={filters.projectSlug ? `/admin/release-applications?project=${filters.projectSlug}` : "/admin/release-applications"}>
              필터 초기화
            </Link>
          </form>

          {items.length === 0 ? (
            <div className="admin-empty">조건에 맞는 참여 신청이 없습니다.</div>
          ) : (
            <div className="admin-application-list">
              {items.map((application) => {
                const role = roleById.get(application.release_role_id);
                const release = role ? releaseById.get(role.release_id) : undefined;
                const roleType = role ? roleTypeByCode.get(role.role_type_code) : undefined;

                return (
                  <article className="admin-application-row" key={application.id}>
                    <div>
                      <span className="admin-status-badge" data-status={application.status}>
                        {statusLabel(application.status)}
                      </span>
                      <p><time dateTime={application.created_at}>{formatDate(application.created_at)}</time></p>
                    </div>
                    <div>
                      <strong>{application.applicant_name}</strong>
                      <p>크레딧 {application.credit_name}</p>
                    </div>
                    <div>
                      <strong>{release?.title ?? "알 수 없는 프로젝트"}</strong>
                      <p>
                        {release ? `${projectLabel(release.project_slug)} · ` : ""}
                        {roleType?.label_ko ?? role?.role_type_code ?? "알 수 없는 파트"}
                      </p>
                    </div>
                    <Link
                      className="admin-form-button"
                      href={`/admin/release-applications/${application.id}`}
                      prefetch={false}
                    >
                      상세 보기
                    </Link>
                  </article>
                );
              })}
            </div>
          )}

          {pageCount > 1 ? (
            <nav className="admin-pagination" aria-label="프로젝트 참여 신청 페이지">
              {page > 1 ? (
                <Link href={buildListHref(filters, page - 1)} prefetch={false}>← 이전</Link>
              ) : <span aria-hidden="true" />}
              <span>{page} / {pageCount}</span>
              {page < pageCount ? (
                <Link href={buildListHref(filters, page + 1)} prefetch={false}>다음 →</Link>
              ) : <span aria-hidden="true" />}
            </nav>
          ) : null}
        </section>
      </div>
    </main>
  );
}
