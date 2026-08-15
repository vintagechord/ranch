import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Footer from "@/app/components/Footer";
import Header from "@/app/components/Header";
import { StudioReelDeck, StudioSpeaker } from "@/app/components/StudioEquipment";
import VintageChordReleases from "@/app/components/VintageChordReleases";
import { getProjectBySlug, projects, type Project } from "@/lib/projects";
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
    <div className={`project-machine project-machine-${project.visual}`}>
      <span className="project-machine-label">{project.shortTitle}</span>
      <div className={`project-equipment project-equipment-${project.visual}`}>
        {isSpeaker ? (
          <>
            <span className="project-sound-wave is-left" aria-hidden="true" />
            <span className="project-sound-wave is-right" aria-hidden="true" />
            <StudioSpeaker playing />
          </>
        ) : (
          <StudioReelDeck />
        )}
      </div>
      <span className="project-machine-index" aria-hidden="true">
        {project.number}
      </span>
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
  const description = isReleaseProject
    ? "PPP 발매 음원과 참여 가능한 파트."
    : project.summary;

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
  const project = getProjectBySlug(slug);

  if (!project) {
    notFound();
  }

  const projectIndex = projects.findIndex((item) => item.slug === project.slug);
  const nextProject = projects[(projectIndex + 1) % projects.length];
  const isReleaseProject = project.slug === RELEASE_PROJECT_SLUG;
  const musicReleases = isReleaseProject
    ? await getPublicMusicReleases()
    : [];
  const projectStyle: ProjectStyle = {
    "--project-accent": project.accent,
    "--project-accent-alt": project.accentAlt
  };

  return (
    <>
      <Header showApplyCta={false} />
      <main
        className={`project-page${isReleaseProject ? " project-page-releases" : ""}`}
        id="top"
        style={projectStyle}
      >
        <div className="project-shell">
          <a className="project-back-link" href="/#project-room">
            <span aria-hidden="true">←</span> ALL PROJECTS
          </a>

          {isReleaseProject ? (
            <VintageChordReleases releases={musicReleases} />
          ) : (
            <>
              <section className="project-hero" aria-labelledby="project-title">
                <div className="project-hero-copy">
                  <div className="project-meta-row">
                    <span className="project-label">{project.label}</span>
                    <span className="project-status">
                      <span className="project-status-dot" aria-hidden="true" />
                      {project.status}
                    </span>
                  </div>
                  <p className="project-artist">{project.artist}</p>
                  <h1 className="project-title" id="project-title">
                    {project.title}
                  </h1>
                </div>

                <ProjectVisual project={project} />
              </section>

              <section className="project-overview" aria-labelledby="project-overview-title">
                <div className="project-section-heading">
                  <span className="project-section-number">A</span>
                  <h2 id="project-overview-title">CURRENT STATUS</h2>
                </div>
                <div className="project-overview-body">
                  <dl className="project-facts">
                    <div className="project-fact">
                      <dt>STATUS</dt>
                      <dd>{project.status}</dd>
                    </div>
                    <div className="project-fact">
                      <dt>CURRENT STAGE</dt>
                      <dd>{project.stage}</dd>
                    </div>
                    <div className="project-fact">
                      <dt>ARTIST</dt>
                      <dd>{project.artist}</dd>
                    </div>
                  </dl>
                </div>
              </section>
            </>
          )}

          <a className="project-next" href={`/projects/${nextProject.slug}`}>
            <span className="project-next-label">NEXT PROJECT</span>
            <span className="project-next-title">
              {nextProject.artist} — {nextProject.title}
            </span>
            <span className="project-next-arrow" aria-hidden="true">
              ↗
            </span>
          </a>
        </div>
      </main>
      <Footer />
    </>
  );
}
