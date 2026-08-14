import type { CSSProperties } from "react";
import Footer from "@/app/components/Footer";
import Header from "@/app/components/Header";
import ProjectStudio from "@/app/components/ProjectStudio";
import ScrollAnimations from "@/app/components/ScrollAnimations";
import { projects } from "@/lib/projects";

export default function Home() {
  const projectCount = String(projects.length).padStart(2, "0");
  const tickerItems = [
    `NOW PLAYING ${projectCount}`,
    ...projects.map((project) => `${project.artist.toUpperCase()} — ${project.title}`),
    "NEW SIGNALS WILL BE CONNECTED"
  ];

  return (
    <>
      <Header showApplyCta={false} />
      <main id="top" className="studio-home">
        <ProjectStudio projects={projects} />

        <div className="studio-ticker" aria-label="현재 진행 중인 프로젝트">
          <div>
            {[0, 1].flatMap((copyIndex) =>
              tickerItems.map((item, itemIndex) => (
                <span aria-hidden={copyIndex === 1 ? "true" : undefined} key={`${copyIndex}-${itemIndex}-${item}`}>
                  {item}
                </span>
              ))
            )}
          </div>
        </div>

        <section id="projects" className="studio-projects" aria-labelledby="project-list-title">
          <div className="studio-section-heading" data-section-title>
            <p>ACTIVE SESSIONS / {projectCount}</p>
            <h2 id="project-list-title">진행 중인 프로젝트</h2>
            <span>각 세션을 열어 진행 상황과 공개된 기록을 확인하세요.</span>
          </div>

          <div className="studio-project-list">
            {projects.map((project) => (
              <a
                className={`studio-project-card is-${project.visual}`}
                href={`/projects/${project.slug}`}
                aria-label={`${project.artist} ‘${project.title}’ 프로젝트 상세 보기`}
                data-reveal-card
                key={project.slug}
                style={{
                  "--project-accent": project.accent,
                  "--project-accent-alt": project.accentAlt
                } as CSSProperties}
              >
                <div className="studio-card-topline">
                  <span>PROJECT {project.number}</span>
                  <span className="studio-card-status"><i /> {project.status}</span>
                </div>

                <div className="studio-card-art" aria-hidden="true">
                  {project.visual === "reel" ? (
                    <div className="studio-card-reels">
                      <span><i /></span>
                      <b />
                      <span><i /></span>
                    </div>
                  ) : (
                    <div className="studio-card-speaker">
                      <span><i /></span>
                      <span><i /></span>
                    </div>
                  )}
                  <div className="studio-card-signal">
                    {Array.from({ length: 18 }, (_, index) => <i key={index} />)}
                  </div>
                </div>

                <div className="studio-card-copy">
                  <p>{project.artist}</p>
                  <h3>{project.title}</h3>
                  <span>{project.summary}</span>
                </div>

                <div className="studio-card-bottom">
                  <span>CURRENT / {project.stage}</span>
                  <strong>프로젝트 열기 <i>↗</i></strong>
                </div>
              </a>
            ))}
          </div>
        </section>

        <section id="about" className="studio-about" aria-labelledby="studio-about-title">
          <div className="studio-about-index" aria-hidden="true">MR—02</div>
          <div className="studio-about-copy" data-section-title>
            <p>ABOUT THE ROOM</p>
            <h2 id="studio-about-title">
              완성된 소리뿐 아니라,
              <br />
              <span>만들어지는 시간까지.</span>
            </h2>
            <p>
              목장의 아침은 음악 프로젝트의 과정을 열어두는 작업실입니다.
              프로젝트가 추가될 때마다 새로운 장비와 트랙이 이 공간에 연결됩니다.
            </p>
          </div>
          <div className="studio-about-console" aria-hidden="true">
            <span>INPUT</span>
            <i />
            <i />
            <i />
            <b>OPEN</b>
          </div>
        </section>

        <section className="studio-next-input" aria-label="다음 프로젝트 안내" data-reveal-card>
          <div>
            <p>NEXT INPUT / CHANNEL {String(projects.length + 1).padStart(2, "0")}</p>
            <h2>다음 프로젝트를 위한 채널</h2>
          </div>
          <p>새 작업이 시작되면 이곳에 새로운 장비와 프로젝트 페이지가 연결됩니다.</p>
          <span aria-hidden="true">＋</span>
        </section>
      </main>
      <Footer />
      <ScrollAnimations />
    </>
  );
}
