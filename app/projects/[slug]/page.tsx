import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Footer from "@/app/components/Footer";
import Header from "@/app/components/Header";
import ProjectParticipationBoard from "@/app/components/ProjectParticipationBoard";
import { StudioMixer, StudioReelDeck, StudioSpeaker } from "@/app/components/StudioEquipment";
import VintageChordReleases from "@/app/components/VintageChordReleases";
import { getProjectBySlug, getProjectStatusLabel, projects, type Project } from "@/lib/projects";
import {
  getPublicActiveProjects,
  getPublicProjectBySlug
} from "@/lib/projectSiteSettings.server";
import { RELEASE_PROJECT_SLUG } from "@/lib/releaseParticipation";
import { getPublicMusicReleases } from "@/lib/releaseParticipation.server";

type ProjectPageProps = {
  params: Promise<{ slug: string }>;
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
  const project = getProjectBySlug(slug);

  if (!project) {
    return {};
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
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "목장의 아침 Project Room" }]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og.png"]
    }
  };
}

export default async function ProjectPage({ params }: ProjectPageProps) {
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
  const projectStyle: ProjectStyle = {
    "--project-accent": project.accent,
    "--project-accent-alt": project.accentAlt
  };

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
                    <span className="project-label">{project.label}</span>
                    <span className="project-status">
                      <span className="project-status-dot" aria-hidden="true" />
                      {getProjectStatusLabel(project.state)}
                    </span>
                  </div>
                  <p className="project-artist">{project.artist}</p>
                  <h1 className="project-title" id="project-title">
                    {project.title}
                  </h1>
                  <p className="project-title-subcopy">{project.subcopy}</p>
                  <div className="project-stage-line">
                    <span>CURRENT STAGE</span>
                    <strong>{project.stage}</strong>
                  </div>
                </div>

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
            <a className="project-next" href={`/projects/${nextProject.slug}`}>
              <span className="project-next-label">ANOTHER PROJECT</span>
              <span className="project-next-title">
                {nextProject.artist} — {nextProject.title}
              </span>
              <span className="project-next-arrow" aria-hidden="true">↗</span>
            </a>
          ) : null}
        </div>
      </main>
      <Footer />
    </>
  );
}
