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
