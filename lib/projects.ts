export type ProjectLog = {
  label: string;
  title: string;
  detail: string;
};

export type Project = {
  slug: string;
  number: string;
  artist: string;
  title: string;
  shortTitle: string;
  status: string;
  stage: string;
  summary: string;
  description: string;
  visual: "reel" | "speaker";
  accent: string;
  accentAlt: string;
  label: string;
  logs: ProjectLog[];
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
    summary: "SunizShine의 ‘이별의 도수’ 프로젝트.",
    description:
      "목장의 아침에서 진행 중인 SunizShine의 ‘이별의 도수’ 프로젝트입니다. 진행 상황과 상세 내역을 이곳에 차곡차곡 기록합니다.",
    visual: "reel",
    accent: "#ff5a36",
    accentAlt: "#ffd43b",
    label: "PROJECT 01",
    logs: [
      {
        label: "CURRENT",
        title: "프로젝트 진행 중",
        detail: "‘이별의 도수’ 프로젝트의 진행 상황을 이 페이지에서 공유합니다."
      },
      {
        label: "NEXT UPDATE",
        title: "공개 가능한 기록부터 업데이트",
        detail: "세부 진행 단계와 결정 사항은 공개 가능한 내용이 확정되는 순서대로 이 로그에 추가됩니다."
      }
    ]
  },
  {
    slug: "vintagechord-post-production",
    number: "02",
    artist: "빈티지코드",
    title: "음원 발매 포스트 프로덕션",
    shortTitle: "POST PRODUCTION",
    status: "진행 중",
    stage: "포스트 프로덕션",
    summary: "빈티지코드의 음원 발매 포스트 프로덕션 프로젝트.",
    description:
      "목장의 아침에서 진행 중인 빈티지코드의 음원 발매 포스트 프로덕션 프로젝트입니다. 진행 상황과 상세 내역을 이곳에 차곡차곡 기록합니다.",
    visual: "speaker",
    accent: "#5765ff",
    accentAlt: "#a6ef5f",
    label: "PROJECT 02",
    logs: [
      {
        label: "CURRENT",
        title: "포스트 프로덕션 진행 중",
        detail: "음원 발매를 위한 포스트 프로덕션의 진행 상황을 이 페이지에서 공유합니다."
      },
      {
        label: "NEXT UPDATE",
        title: "세부 작업 내역 업데이트 예정",
        detail: "확정되어 공개할 수 있는 작업 내역을 정리해 이 로그에 순서대로 추가합니다."
      }
    ]
  }
];

export function getProjectBySlug(slug: string) {
  return projects.find((project) => project.slug === slug);
}
