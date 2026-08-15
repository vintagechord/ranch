export const RELEASE_PROJECT_SLUG = "vintagechord-post-production";
export const RELEASE_APPLICATION_PRIVACY_VERSION = "2026-08-15-release-participation-v1";
export const RELEASE_CREDIT_PUBLICATION_VERSION = "2026-08-15-release-credit-publication-v1";

export const MUSIC_RELEASE_STATES = [
  "draft",
  "upcoming",
  "released",
  "archived"
] as const;

export const RELEASE_ROLE_STATES = ["open", "paused", "filled", "closed"] as const;

export const RELEASE_APPLICATION_STATUSES = [
  "new",
  "reviewing",
  "contacted",
  "shortlisted",
  "accepted",
  "declined",
  "withdrawn"
] as const;

export const SEEDED_RELEASE_ROLE_CODES = [
  "artwork",
  "liner_notes",
  "music_video",
  "composition",
  "lyrics",
  "arrangement",
  "vocal"
] as const;

export type MusicReleaseState = (typeof MUSIC_RELEASE_STATES)[number];
export type ReleaseRoleState = (typeof RELEASE_ROLE_STATES)[number];
export type ReleaseApplicationStatus = (typeof RELEASE_APPLICATION_STATUSES)[number];
export type SeededReleaseRoleCode = (typeof SEEDED_RELEASE_ROLE_CODES)[number];
export type ReleaseRoleCategory = "visual" | "editorial" | "video" | "music" | "other";

export type PublicReleaseCredit = {
  id: string;
  displayName: string;
  isRanchMember: boolean;
  participantSlot: number | null;
  sortOrder: number;
};

export type PublicReleaseLead = {
  leadId: string;
  roleCode: string;
  roleLabel: string;
  category: ReleaseRoleCategory;
  state: ReleaseRoleState;
  brief: string | null;
  requirements: string | null;
  capacity: number;
  applicationDeadline: string | null;
  sortOrder: number;
  credits: PublicReleaseCredit[];
  canApply: boolean;
};

export type PublicMusicRelease = {
  id: string;
  releaseNumber: number;
  title: string;
  artistName: string;
  releaseDate: string | null;
  state: MusicReleaseState;
  youtubeVideoId: string | null;
  coverImageUrl: string | null;
  summary: string | null;
  leads: PublicReleaseLead[];
};

export type ReleaseParticipationApplicationPayload = {
  submission_type: "release_participation";
  lead_id: string;
  idempotency_key: string;
  name: string;
  credit_name: string;
  email: string;
  phone?: string;
  profile_url?: string;
  portfolio_url?: string;
  availability: string;
  message: string;
  privacy_agreed: true;
  credit_publication_agreed: true;
  website?: string;
};

export function releaseApplicationStatusLabel(status: ReleaseApplicationStatus) {
  if (status === "reviewing") return "검토 중";
  if (status === "contacted") return "연락 완료";
  if (status === "shortlisted") return "후보";
  if (status === "accepted") return "참여 확정";
  if (status === "declined") return "미선정";
  if (status === "withdrawn") return "신청 철회";
  return "새 신청";
}
