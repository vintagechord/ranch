import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Footer from "@/app/components/Footer";
import Header from "@/app/components/Header";
import ProjectParticipationBoard from "@/app/components/ProjectParticipationBoard";
import { StudioMixer, StudioReelDeck, StudioSpeaker } from "@/app/components/StudioEquipment";
import VintageChordReleases from "@/app/components/VintageChordReleases";
import { getProjectStatusLabel, projects, type Project } from "@/lib/projects";
import {
  getPublicActiveProjects,
  getPublicProjectBySlug
} from "@/lib/projectSiteSettings.server";
import { isProjectAccessAuthorized } from "@/lib/projectAccess.server";
import { RELEASE_PROJECT_SLUG } from "@/lib/releaseParticipation";
import { getPublicMusicReleases } from "@/lib/releaseParticipation.server";

type ProjectPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ access?: string }>;
};

type ProjectStyle = CSSProperties & {
  "--project-accent": string;
  "--project-accent-alt": string;
};

export const dynamic = "force-dynamic";

function ProjectVisual({ project }: { project: Project }) {
  const isSpeaker = project.visual === "speaker";

  return (
    <div
      className={`project-machine project-machine-${project.visual}${isSpeaker ? "" : " is-bare"}`}
    >
      {isSpeaker ? <span className="project-machine-label">{project.shortTitle}</span> : null}
      <div className={`project-equipment project-equipment-${project.visual}`}>
        {isSpeaker ? (
          <>
            <span className="project-sound-wave is-left" aria-hidden="true" />
            <span className="project-sound-wave is-right" aria-hidden="true" />
            <StudioSpeaker playing />
          </>
        ) : project.visual === "mixer" ? (
          <StudioMixer />
        ) : (
          <StudioReelDeck />
        )}
      </div>
      {isSpeaker ? (
        <span className="project-machine-index" aria-hidden="true">
          {project.number}
        </span>
      ) : null}
    </div>
  );
}

export function generateStaticParams() {
  return projects.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = await getPublicProjectBySlug(slug);

  if (!project) {
    return {};
  }

  if (project.isPasswordProtected) {
    const title = "보호된 프로젝트 | 목장의 아침";
    const description = "입장 비밀번호가 필요한 목장의 아침 프로젝트 페이지입니다.";

    return {
      title,
      description,
      robots: {
        index: false,
        follow: false,
        noarchive: true,
        nocache: true
      }
    };
  }

  const isReleaseProject = project.slug === RELEASE_PROJECT_SLUG;
  const title = isReleaseProject
    ? "PPP | 목장의 아침"
    : `${project.artist} — ${project.title} | 목장의 아침`;
  const description = project.subcopy;

  return {
    title,
    description,
    openGraph: {
      type: "website",
      locale: "ko_KR",
      title,
      description,
      images: [{ url: "/og-ibam.png", width: 1200, height: 630, alt: "목장의 아침 Project Room" }]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-ibam.png"]
    }
  };
}

export default async function ProjectPage({ params, searchParams }: ProjectPageProps) {
  const { slug } = await params;
  const [projectResult, publicProjectsResult] = await Promise.allSettled([
    getPublicProjectBySlug(slug),
    getPublicActiveProjects()
  ]);

  if (projectResult.status === "rejected") {
    console.error("Public project setting load failed:", projectResult.reason);
    notFound();
  }

  const project = projectResult.value;
  if (!project) {
    notFound();
  }

  const publicProjects = publicProjectsResult.status === "fulfilled"
    ? publicProjectsResult.value
    : [];

  if (publicProjectsResult.status === "rejected") {
    console.error("Public project navigation settings load failed:", publicProjectsResult.reason);
  }

  const projectStyle: ProjectStyle = {
    "--project-accent": project.accent,
    "--project-accent-alt": project.accentAlt
  };

  if (
    project.isPasswordProtected &&
    !(await isProjectAccessAuthorized(project.slug, project.accessVersion))
  ) {
    const { access } = await searchParams;
    const accessMessage = access === "invalid"
      ? "비밀번호가 맞지 않습니다. 다시 확인해 주세요."
      : access === "rate"
        ? "입력 시도가 많습니다. 잠시 후 다시 시도해 주세요."
        : access === "unavailable"
          ? "지금은 입장 확인을 처리할 수 없습니다. 잠시 후 다시 시도해 주세요."
          : "";

    return (
      <>
        <Header projects={publicProjects} showApplyCta={false} />
        <main className="project-page project-access-page" id="top" style={projectStyle}>
          <div className="project-shell project-access-shell">
            <a className="project-back-link" href="/#project-room">
              <span aria-hidden="true">←</span> ALL PROJECTS
            </a>

            <section className="project-access-panel" aria-labelledby="project-access-title">
              <div className="project-access-mark" aria-hidden="true">
                <span />
              </div>
              <div className="project-access-copy">
                <p className="project-access-eyebrow">PRIVATE PROJECT · {project.number}</p>
                <h1 id="project-access-title">입장 비밀번호를 입력해 주세요.</h1>
                <p>
                  <strong>{project.shortTitle}</strong> 프로젝트는 입장 비밀번호로 보호되어 있습니다.
                </p>
              </div>

              <form
                className="project-access-form"
                action={`/api/projects/${project.slug}/access`}
                method="post"
              >
                <label htmlFor="project-access-password">입장 비밀번호</label>
                <div className="project-access-input-row">
                  <input
                    id="project-access-password"
                    name="password"
                    type="password"
                    minLength={6}
                    maxLength={128}
                    autoComplete="current-password"
                    autoCapitalize="none"
                    spellCheck={false}
                    aria-invalid={access === "invalid" || undefined}
                    aria-describedby={accessMessage ? "project-access-message" : "project-access-help"}
                    required
                  />
                  <button type="submit">입장하기 <span aria-hidden="true">↗</span></button>
                </div>
                {accessMessage ? (
                  <p className="project-access-message" id="project-access-message" role="alert">
                    {accessMessage}
                  </p>
                ) : (
                  <p className="project-access-help" id="project-access-help">
                    전달받은 비밀번호를 그대로 입력해 주세요.
                  </p>
                )}
              </form>
            </section>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const projectIndex = publicProjects.findIndex((item) => item.slug === project.slug);
  const nextProject = publicProjects.length > 1
    ? publicProjects[(projectIndex + 1) % publicProjects.length]
    : null;
  const isReleaseProject = project.slug === RELEASE_PROJECT_SLUG;
  const isPerformanceProject = project.kind === "performance";
  const projectReleases = await getPublicMusicReleases(project.slug);
  const participationRelease = [...projectReleases]
    .filter((release) => release.state === "upcoming")
    .sort((a, b) => b.releaseNumber - a.releaseNumber)
    .find((release) => release.leads.some((lead) => lead.canApply || lead.credits.length > 0))
    ?? [...projectReleases]
      .filter((release) => release.state === "upcoming")
      .sort((a, b) => b.releaseNumber - a.releaseNumber)[0]
    ?? null;
  return (
    <>
      <Header projects={publicProjects} showApplyCta={false} />
      <main
        className={`project-page project-page-compact${isReleaseProject ? " project-page-releases" : " project-page-participation"}${isPerformanceProject ? " project-page-performance" : ""}`}
        id="top"
        style={projectStyle}
      >
        <div className="project-shell">
          <a className="project-back-link" href="/#project-room">
            <span aria-hidden="true">←</span> ALL PROJECTS
          </a>

          {isReleaseProject ? (
            <VintageChordReleases releases={projectReleases} subcopy={project.subcopy} />
          ) : (
            <>
              <section className="project-hero" aria-labelledby="project-title">
                <div className="project-hero-copy">
                  <div className="project-meta-row">
                    <span className="project-status">
                      <span className="project-status-dot" aria-hidden="true" />
                      {getProjectStatusLabel(project.state)}
                    </span>
                    <p className="project-artist">{project.artist}</p>
                  </div>
                  <h1 className="project-title" id="project-title">
                    {project.title}
                  </h1>
                  <div className="project-stage-line">
                    <span>CURRENT STAGE</span>
                    <strong>{project.stage}</strong>
                  </div>
                </div>

                <section className="project-hero-intro" aria-labelledby="project-description-title">
                  <h2 className="sr-only" id="project-description-title">프로젝트 소개</h2>
                  <p>{project.subcopy}</p>
                </section>

                <ProjectVisual project={project} />
              </section>

              {participationRelease ? (
                <ProjectParticipationBoard
                  projectTitle={`${project.artist}의 ‘${project.title}’`}
                  release={participationRelease}
                  variant={isPerformanceProject ? "performance" : "default"}
                />
              ) : null}
            </>
          )}

          {nextProject ? (
            <aside className="project-other-projects" aria-label="다른 프로젝트">
              <a className="project-next" href={`/projects/${nextProject.slug}`}>
                <span className="project-next-label">ANOTHER PROJECT</span>
                <span className="project-next-title">
                  {nextProject.artist} — {nextProject.title}
                </span>
                <span className="project-next-arrow" aria-hidden="true">↗</span>
              </a>
            </aside>
          ) : null}
        </div>
      </main>
      <Footer />
    </>
  );
}
