export type Project = {
  slug: string;
  number: string;
  artist: string;
  title: string;
  shortTitle: string;
  stage: string;
  summary: string;
  visual: "reel" | "speaker";
  accent: string;
  accentAlt: string;
  label: string;
  state: "active" | "archived";
};

export const projects: Project[] = [
  {
    slug: "ibyeol-ui-dosu",
    number: "01",
    artist: "SunizShine",
    title: "이별의 도수",
    shortTitle: "이별의 도수",
    stage: "참여 파트 모집 중",
    summary: "SunizShine의 ‘이별의 도수’",
    visual: "reel",
    accent: "#ff5a36",
    accentAlt: "#ffd43b",
    label: "PROJECT 01",
    state: "active"
  },
  {
    slug: "vintagechord-post-production",
    number: "02",
    artist: "빈티지코드",
    title: "PPP",
    shortTitle: "PPP",
    stage: "포스트 프로덕션",
    summary: "빈티지코드의 PPP",
    visual: "speaker",
    accent: "#5765ff",
    accentAlt: "#a6ef5f",
    label: "PROJECT 02",
    state: "active"
  }
];

export const activeProjects = projects.filter((project) => project.state === "active");

export function getProjectStatusLabel(state: Project["state"]) {
  return state === "active" ? "진행 중" : "보관됨";
}

export function getProjectBySlug(slug: string) {
  return projects.find((project) => project.slug === slug);
}
