import Footer from "@/app/components/Footer";
import Header from "@/app/components/Header";
import ProjectProposal from "@/app/components/ProjectProposal";
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

        <div className="studio-ticker" aria-label="프로젝트 채널 신호">
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

        <ProjectProposal channelNumber={String(projects.length + 1).padStart(2, "0")} />
      </main>
      <Footer />
      <ScrollAnimations />
    </>
  );
}
