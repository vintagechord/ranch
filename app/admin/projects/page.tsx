import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import {
  getAdminProjects,
  type ConfiguredProject
} from "@/lib/projectSiteSettings.server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type ProjectMetrics = {
  releases: number;
  openRoles: number;
  applications: number;
};

function lifecycleLabel(project: ConfiguredProject) {
  if (project.lifecycle === "completed") return "완료";
  if (project.lifecycle === "archived") return "보관";
  return "진행 중";
}

async function getProjectMetrics(projectSlugs: string[]) {
  const metrics = new Map<string, ProjectMetrics>(
    projectSlugs.map((slug) => [slug, { releases: 0, openRoles: 0, applications: 0 }])
  );
  if (projectSlugs.length === 0) return metrics;

  const supabase = getSupabaseAdmin();
  const { data: releaseData, error: releaseError } = await supabase
    .from("music_releases")
    .select("id, project_slug, state, is_published")
    .in("project_slug", projectSlugs);

  if (releaseError) throw new Error(releaseError.message);

  const releases = releaseData ?? [];
  const releaseById = new Map(releases.map((release) => [release.id, release]));
  releases.forEach((release) => {
    const current = metrics.get(release.project_slug);
    if (current) current.releases += 1;
  });

  if (releases.length === 0) return metrics;

  const { data: roleData, error: roleError } = await supabase
    .from("release_roles")
    .select("id, release_id, state, is_public, application_deadline")
    .in("release_id", releases.map((release) => release.id));

  if (roleError) throw new Error(roleError.message);

  const roles = roleData ?? [];
  const projectByRoleId = new Map<string, string>();
  roles.forEach((role) => {
    const release = releaseById.get(role.release_id);
    if (!release) return;
    projectByRoleId.set(role.id, release.project_slug);
    if (
      release.state === "upcoming" &&
      release.is_published &&
      role.state === "open" &&
      role.is_public &&
      (!role.application_deadline || Date.parse(role.application_deadline) > Date.now())
    ) {
      const current = metrics.get(release.project_slug);
      if (current) current.openRoles += 1;
    }
  });

  if (roles.length === 0) return metrics;

  const { data: applicationData, error: applicationError } = await supabase
    .from("release_participation_applications")
    .select("id, release_role_id")
    .in("release_role_id", roles.map((role) => role.id))
    .gt("retention_until", new Date().toISOString());

  if (applicationError) throw new Error(applicationError.message);

  (applicationData ?? []).forEach((application) => {
    const slug = projectByRoleId.get(application.release_role_id);
    const current = slug ? metrics.get(slug) : undefined;
    if (current) current.applications += 1;
  });

  return metrics;
}

export default async function AdminProjectsPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin");
  }

  const configuredProjects = await getAdminProjects();
  const metricsBySlug = await getProjectMetrics(configuredProjects.map((project) => project.slug));

  return (
    <main className="admin-shell admin-project-directory">
      <header className="admin-topbar">
        <div>
          <p className="admin-eyebrow">PROJECT DIRECTORY</p>
          <h1>프로젝트 관리</h1>
        </div>
      </header>

      <section className="admin-project-directory-intro" aria-labelledby="admin-project-directory-title">
        <div>
          <p className="admin-eyebrow">ACTIVE WORKSPACES</p>
          <h2 id="admin-project-directory-title">프로젝트별 작업실</h2>
        </div>
        <p>
          각 프로젝트의 음원, 참여 파트, 신청 흐름을 독립된 작업실에서 관리합니다.
          새 프로젝트가 연결되면 이 목록에 같은 구조로 추가됩니다.
        </p>
      </section>

      <div className="admin-project-directory-grid">
        {configuredProjects.map((project) => {
          const metrics = metricsBySlug.get(project.slug) ?? { releases: 0, openRoles: 0, applications: 0 };
          const titleId = `admin-project-${project.slug}-title`;

          return (
            <article
              className="admin-project-directory-card"
              data-project-state={project.lifecycle}
              aria-labelledby={titleId}
              key={project.slug}
            >
              <header>
                <span>{project.label}</span>
                <strong>{lifecycleLabel(project)}</strong>
              </header>

              <div className="admin-project-directory-title">
                <p>{project.artist}</p>
                <h2 id={titleId}>{project.title}</h2>
              </div>

              <dl className="admin-project-lifecycle" aria-label={`${project.title} 운영 상태`}>
                <div>
                  <dt>현재 단계</dt>
                  <dd>{project.stage}</dd>
                </div>
                <div>
                  <dt>공개 상태</dt>
                  <dd>{project.isPublic ? "사이트 공개" : "사이트 숨김"}</dd>
                </div>
                <div>
                  <dt>운영 지표</dt>
                  <dd>항목 {metrics.releases} · 모집 {metrics.openRoles} · 신청 {metrics.applications}</dd>
                </div>
              </dl>

              <footer>
                <Link
                  className="admin-project-primary-link"
                  href={`/admin/projects/${project.slug}`}
                  prefetch={false}
                >
                  관리 열기 <span aria-hidden="true">→</span>
                </Link>
                {project.isPublic ? (
                  <Link href={`/projects/${project.slug}`} target="_blank" rel="noopener noreferrer">
                    공개 페이지 <span aria-hidden="true">↗</span>
                  </Link>
                ) : (
                  <span className="admin-project-hidden-label">공개 페이지 숨김</span>
                )}
              </footer>
            </article>
          );
        })}
      </div>
    </main>
  );
}
