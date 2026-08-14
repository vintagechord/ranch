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
