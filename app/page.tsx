import Footer from "@/app/components/Footer";
import Header from "@/app/components/Header";
import ProjectProposal from "@/app/components/ProjectProposal";
import ProjectStudio from "@/app/components/ProjectStudio";
import ScrollAnimations from "@/app/components/ScrollAnimations";
import { projects } from "@/lib/projects";
import {
  getNextMeetingSetting,
  getPublicActiveProjects,
  type NextMeetingSetting
} from "@/lib/projectSiteSettings.server";

export const dynamic = "force-dynamic";

function formatNextMeeting(setting: NextMeetingSetting) {
  if (!setting.isVisible) return null;

  const date = new Date(setting.nextMeetingAt);
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul"
  }).formatToParts(date);
  const month = dateParts.find((part) => part.type === "month")?.value ?? "--";
  const day = dateParts.find((part) => part.type === "day")?.value ?? "--";

  return {
    accessibleDateTime: new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Asia/Seoul"
    }).format(date),
    dateTime: setting.nextMeetingAt,
    dateLabel: `${month}.${day}`,
    timeLabel: new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: "Asia/Seoul"
    }).format(date),
    venue: setting.venue
  };
}

export default async function Home() {
  const [projectsResult, meetingResult] = await Promise.allSettled([
    getPublicActiveProjects(),
    getNextMeetingSetting()
  ]);
  const activeProjects = projectsResult.status === "fulfilled" ? projectsResult.value : [];
  const nextMeeting = meetingResult.status === "fulfilled"
    ? formatNextMeeting(meetingResult.value)
    : null;

  if (projectsResult.status === "rejected") {
    console.error("Public project settings load failed:", projectsResult.reason);
  }
  if (meetingResult.status === "rejected") {
    console.error("Public meeting setting load failed:", meetingResult.reason);
  }

  const tickerItems = [
    ...activeProjects.map((project) => `${project.artist.toUpperCase()} — ${project.title}`),
    "NEW SIGNALS WILL BE CONNECTED"
  ];

  return (
    <>
      <Header projects={activeProjects} showApplyCta={false} />
      <main id="top" className="studio-home">
        <ProjectStudio nextMeeting={nextMeeting} projects={activeProjects} />

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
