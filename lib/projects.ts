export type Project = {
  slug: string;
  number: string;
  artist: string;
  title: string;
  shortTitle: string;
  status: string;
  stage: string;
  summary: string;
  visual: "reel" | "speaker";
  accent: string;
  accentAlt: string;
  label: string;
};

export const projects: Project[] = [
  {
    slug: "ibyeol-ui-dosu",
    number: "01",
    artist: "SunizShine",
    title: "이별의 도수",
    shortTitle: "이별의 도수",
    status: "진행 중",
    stage: "업데이트 예정",
    summary: "SunizShine의 ‘이별의 도수’",
    visual: "reel",
    accent: "#ff5a36",
    accentAlt: "#ffd43b",
    label: "PROJECT 01"
  },
  {
    slug: "vintagechord-post-production",
    number: "02",
    artist: "빈티지코드",
    title: "음원 발매 포스트 프로덕션",
    shortTitle: "POST PRODUCTION",
    status: "진행 중",
    stage: "포스트 프로덕션",
    summary: "빈티지코드의 음원 발매 포스트 프로덕션",
    visual: "speaker",
    accent: "#5765ff",
    accentAlt: "#a6ef5f",
    label: "PROJECT 02"
  }
];

export function getProjectBySlug(slug: string) {
  return projects.find((project) => project.slug === slug);
}
