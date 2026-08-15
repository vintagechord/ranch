import "server-only";

import {
  MUSIC_RELEASE_STATES,
  RELEASE_APPLICATION_STATUSES,
  RELEASE_PROJECT_SLUG,
  RELEASE_ROLE_STATES,
  type MusicReleaseState,
  type PublicMusicRelease,
  type PublicReleaseCredit,
  type PublicReleaseLead,
  type ReleaseApplicationStatus,
  type ReleaseRoleCategory,
  type ReleaseRoleState
} from "@/lib/releaseParticipation";
import type {
  MusicReleaseRow,
  ReleaseApplicationStatusEventRow,
  ReleaseCreditRow,
  ReleaseParticipationApplicationRow,
  ReleaseRoleRow,
  ReleaseRoleTypeRow
} from "@/lib/supabase";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type PublicReleaseRow = Pick<
  MusicReleaseRow,
  | "id"
  | "release_number"
  | "title"
  | "artist_name"
  | "release_date"
  | "state"
  | "youtube_video_id"
  | "cover_image_url"
  | "summary"
>;

type PublicRoleRow = Pick<
  ReleaseRoleRow,
  | "id"
  | "release_id"
  | "role_type_code"
  | "state"
  | "brief"
  | "requirements"
  | "capacity"
  | "application_deadline"
  | "sort_order"
>;

type PublicRoleTypeRow = Pick<
  ReleaseRoleTypeRow,
  "code" | "label_ko" | "category" | "is_active"
>;

type PublicCreditRow = Pick<
  ReleaseCreditRow,
  "id" | "release_role_id" | "display_name" | "is_ranch_member" | "participant_slot" | "sort_order"
>;

export type ReleaseApplicationQueueItem = Pick<
  ReleaseParticipationApplicationRow,
  | "id"
  | "created_at"
  | "applicant_name"
  | "credit_name"
  | "email"
  | "status"
  | "retention_until"
> & {
  releaseNumber: number;
  releaseTitle: string;
  roleCode: string;
  roleLabel: string;
};

export type ReleaseApplicationDetail = {
  application: Omit<ReleaseParticipationApplicationRow, "idempotency_key" | "payload_hash">;
  release: Pick<MusicReleaseRow, "id" | "release_number" | "title" | "artist_name" | "release_date">;
  lead: Pick<ReleaseRoleRow, "id" | "role_type_code" | "state"> & {
    roleLabel: string;
  };
  events: ReleaseApplicationStatusEventRow[];
};

function isMusicReleaseState(value: string): value is MusicReleaseState {
  return MUSIC_RELEASE_STATES.includes(value as MusicReleaseState);
}

function isReleaseRoleState(value: string): value is ReleaseRoleState {
  return RELEASE_ROLE_STATES.includes(value as ReleaseRoleState);
}

function isReleaseApplicationStatus(value: string): value is ReleaseApplicationStatus {
  return RELEASE_APPLICATION_STATUSES.includes(value as ReleaseApplicationStatus);
}

function isReleaseRoleCategory(value: string): value is ReleaseRoleCategory {
  return ["visual", "editorial", "video", "music", "other"].includes(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function uniqueValues(values: string[]) {
  return [...new Set(values)];
}

export async function getPublicMusicReleases(
  projectSlug = RELEASE_PROJECT_SLUG
): Promise<PublicMusicRelease[]> {
  const supabase = getSupabaseAdmin();
  const { data: releaseData, error: releaseError } = await supabase
    .from("music_releases")
    .select(
      "id, release_number, title, artist_name, release_date, state, youtube_video_id, cover_image_url, summary"
    )
    .eq("project_slug", projectSlug)
    .eq("is_published", true)
    .in("state", ["upcoming", "released"])
    .order("release_number", { ascending: true });

  if (releaseError) {
    throw new Error(releaseError.message);
  }

  const releases = (releaseData ?? []) as PublicReleaseRow[];

  if (releases.length === 0) {
    return [];
  }

  const releaseIds = releases.map(({ id }) => id);
  const { data: roleData, error: roleError } = await supabase
    .from("release_roles")
    .select(
      "id, release_id, role_type_code, state, brief, requirements, capacity, application_deadline, sort_order"
    )
    .in("release_id", releaseIds)
    .eq("is_public", true)
    .order("sort_order", { ascending: true });

  if (roleError) {
    throw new Error(roleError.message);
  }

  const roles = (roleData ?? []) as PublicRoleRow[];
  const roleCodes = uniqueValues(roles.map(({ role_type_code }) => role_type_code));
  const roleIds = roles.map(({ id }) => id);

  const [roleTypeResult, creditResult] = await Promise.all([
    roleCodes.length > 0
      ? supabase
          .from("release_role_types")
          .select("code, label_ko, category, is_active")
          .in("code", roleCodes)
      : Promise.resolve({ data: [] as PublicRoleTypeRow[], error: null }),
    roleIds.length > 0
      ? supabase
          .from("release_credits")
          .select(
            "id, release_role_id, display_name, is_ranch_member, participant_slot, sort_order"
          )
          .in("release_role_id", roleIds)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as PublicCreditRow[], error: null })
  ]);

  if (roleTypeResult.error) {
    throw new Error(roleTypeResult.error.message);
  }

  if (creditResult.error) {
    throw new Error(creditResult.error.message);
  }

  const roleTypes = (roleTypeResult.data ?? []) as PublicRoleTypeRow[];
  const credits = (creditResult.data ?? []) as PublicCreditRow[];
  const roleTypeByCode = new Map(roleTypes.map((roleType) => [roleType.code, roleType]));
  const creditsByRoleId = new Map<string, PublicReleaseCredit[]>();

  for (const credit of credits) {
    const roleCredits = creditsByRoleId.get(credit.release_role_id) ?? [];
    roleCredits.push({
      id: credit.id,
      displayName: credit.display_name,
      isRanchMember: credit.is_ranch_member,
      participantSlot: credit.participant_slot,
      sortOrder: credit.sort_order
    });
    creditsByRoleId.set(credit.release_role_id, roleCredits);
  }

  const leadsByReleaseId = new Map<string, PublicReleaseLead[]>();
  const now = Date.now();

  for (const role of roles) {
    const roleType = roleTypeByCode.get(role.role_type_code);

    if (
      !roleType?.is_active ||
      !isReleaseRoleCategory(roleType.category) ||
      !isReleaseRoleState(role.state)
    ) {
      continue;
    }

    const deadlineIsOpen =
      !role.application_deadline || Date.parse(role.application_deadline) > now;
    const releaseLeads = leadsByReleaseId.get(role.release_id) ?? [];

    releaseLeads.push({
      leadId: role.id,
      roleCode: role.role_type_code,
      roleLabel: roleType.label_ko,
      category: roleType.category,
      state: role.state,
      brief: role.brief,
      requirements: role.requirements,
      capacity: role.capacity,
      applicationDeadline: role.application_deadline,
      sortOrder: role.sort_order,
      credits: creditsByRoleId.get(role.id) ?? [],
      canApply: role.state === "open" && deadlineIsOpen
    });
    leadsByReleaseId.set(role.release_id, releaseLeads);
  }

  return releases.flatMap((release) => {
    if (!isMusicReleaseState(release.state)) {
      return [];
    }

    return [{
      id: release.id,
      releaseNumber: release.release_number,
      title: release.title,
      artistName: release.artist_name,
      releaseDate: release.release_date,
      state: release.state,
      youtubeVideoId: release.youtube_video_id,
      coverImageUrl: release.cover_image_url,
      summary: release.summary,
      leads: (leadsByReleaseId.get(release.id) ?? []).map((lead) => ({
        ...lead,
        canApply: release.state === "upcoming" && lead.canApply
      }))
    }];
  });
}

export async function getReleaseParticipationApplicationQueue({
  page = 1,
  pageSize = 24,
  status
}: {
  page?: number;
  pageSize?: number;
  status?: ReleaseApplicationStatus;
} = {}) {
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const safePageSize = Number.isSafeInteger(pageSize)
    ? Math.min(Math.max(pageSize, 1), 100)
    : 24;
  const now = new Date().toISOString();
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("release_participation_applications")
    .select(
      "id, release_role_id, created_at, applicant_name, credit_name, email, status, retention_until",
      { count: "exact" }
    )
    .gt("retention_until", now);

  if (status && isReleaseApplicationStatus(status)) {
    query = query.eq("status", status);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(error.message);
  }

  const applications = (data ?? []) as Array<
    Pick<
      ReleaseParticipationApplicationRow,
      | "id"
      | "release_role_id"
      | "created_at"
      | "applicant_name"
      | "credit_name"
      | "email"
      | "status"
      | "retention_until"
    >
  >;

  if (applications.length === 0) {
    return { items: [] as ReleaseApplicationQueueItem[], total: count ?? 0 };
  }

  const roleIds = uniqueValues(applications.map(({ release_role_id }) => release_role_id));
  const { data: roleData, error: roleError } = await supabase
    .from("release_roles")
    .select("id, release_id, role_type_code")
    .in("id", roleIds);

  if (roleError) {
    throw new Error(roleError.message);
  }

  const roles = (roleData ?? []) as Array<
    Pick<ReleaseRoleRow, "id" | "release_id" | "role_type_code">
  >;
  const releaseIds = uniqueValues(roles.map(({ release_id }) => release_id));
  const roleCodes = uniqueValues(roles.map(({ role_type_code }) => role_type_code));
  const [releaseResult, roleTypeResult] = await Promise.all([
    supabase
      .from("music_releases")
      .select("id, release_number, title")
      .in("id", releaseIds),
    supabase
      .from("release_role_types")
      .select("code, label_ko")
      .in("code", roleCodes)
  ]);

  if (releaseResult.error) {
    throw new Error(releaseResult.error.message);
  }

  if (roleTypeResult.error) {
    throw new Error(roleTypeResult.error.message);
  }

  const releaseById = new Map(
    (releaseResult.data ?? []).map((release) => [release.id, release])
  );
  const roleTypeByCode = new Map(
    (roleTypeResult.data ?? []).map((roleType) => [roleType.code, roleType])
  );
  const roleById = new Map(roles.map((role) => [role.id, role]));
  const items = applications.flatMap((application): ReleaseApplicationQueueItem[] => {
    const role = roleById.get(application.release_role_id);
    const release = role ? releaseById.get(role.release_id) : undefined;
    const roleType = role ? roleTypeByCode.get(role.role_type_code) : undefined;

    if (!role || !release || !roleType || !isReleaseApplicationStatus(application.status)) {
      return [];
    }

    return [{
      id: application.id,
      created_at: application.created_at,
      applicant_name: application.applicant_name,
      credit_name: application.credit_name,
      email: application.email,
      status: application.status,
      retention_until: application.retention_until,
      releaseNumber: release.release_number,
      releaseTitle: release.title,
      roleCode: role.role_type_code,
      roleLabel: roleType.label_ko
    }];
  });

  return { items, total: count ?? items.length };
}

export async function getReleaseParticipationApplicationDetail(
  applicationId: string
): Promise<ReleaseApplicationDetail | null> {
  if (!isUuid(applicationId)) {
    return null;
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { data: applicationData, error: applicationError } = await supabase
    .from("release_participation_applications")
    .select(
      "id, release_role_id, applicant_name, credit_name, email, phone, profile_url, portfolio_url, availability, message, status, admin_note, status_changed_at, privacy_agreed, consented_at, privacy_notice_version, credit_publication_agreed, credit_publication_consented_at, credit_publication_notice_version, retention_until, created_at, updated_at"
    )
    .eq("id", applicationId)
    .gt("retention_until", now)
    .maybeSingle();

  if (applicationError) {
    throw new Error(applicationError.message);
  }

  if (!applicationData) {
    return null;
  }

  const application = applicationData as Omit<
    ReleaseParticipationApplicationRow,
    "idempotency_key" | "payload_hash"
  >;
  const { data: roleData, error: roleError } = await supabase
    .from("release_roles")
    .select("id, release_id, role_type_code, state")
    .eq("id", application.release_role_id)
    .single();

  if (roleError) {
    throw new Error(roleError.message);
  }

  const role = roleData as Pick<ReleaseRoleRow, "id" | "release_id" | "role_type_code" | "state">;
  const [releaseResult, roleTypeResult, eventResult] = await Promise.all([
    supabase
      .from("music_releases")
      .select("id, release_number, title, artist_name, release_date")
      .eq("id", role.release_id)
      .single(),
    supabase
      .from("release_role_types")
      .select("label_ko")
      .eq("code", role.role_type_code)
      .single(),
    supabase
      .from("release_application_status_events")
      .select("id, application_id, from_status, to_status, note, created_at")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
  ]);

  if (releaseResult.error) throw new Error(releaseResult.error.message);
  if (roleTypeResult.error) throw new Error(roleTypeResult.error.message);
  if (eventResult.error) throw new Error(eventResult.error.message);

  return {
    application,
    release: releaseResult.data,
    lead: {
      id: role.id,
      role_type_code: role.role_type_code,
      state: role.state,
      roleLabel: roleTypeResult.data.label_ko
    },
    events: (eventResult.data ?? []) as ReleaseApplicationStatusEventRow[]
  };
}
