export type Project = {
  slug: string;
  number: string;
  artist: string;
  title: string;
  shortTitle: string;
  stage: string;
  summary: string;
  subcopy: string;
  kind: "album" | "post-production" | "performance";
  visual: "reel" | "speaker" | "mixer";
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
    title: "이밤의 도수",
    shortTitle: "이밤의 도수",
    stage: "참여 파트 모집 중",
    summary: "SunizShine의 ‘이밤의 도수’",
    subcopy: "SunizShine의 첫 공식 제작 앨범 프로젝트",
    kind: "album",
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
    subcopy: "빈티지코드가 제작하는 음원의 후반 작업 참여 프로젝트",
    kind: "post-production",
    visual: "speaker",
    accent: "#5765ff",
    accentAlt: "#a6ef5f",
    label: "PROJECT 02",
    state: "active"
  },
  {
    slug: "wandurup-dudu",
    number: "03",
    artist: "스트레인지 팩토리 친구들",
    title: "완두룹두두",
    shortTitle: "완두룹두두",
    stage: "공연 참여 모집 중",
    summary: "스트레인지 팩토리 친구들이 함께 만드는 완두룹두두 공연",
    subcopy: "스트레인지 팩토리 친구들이 함께하는 신박한 공연 프로젝트",
    kind: "performance",
    visual: "mixer",
    accent: "#a6ef5f",
    accentAlt: "#ff7b4d",
    label: "PROJECT 03",
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
