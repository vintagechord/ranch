import { randomUUID } from "node:crypto";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import AdminActionButton from "@/app/components/AdminActionButton";
import AdminReleaseCoverManager from "@/app/components/AdminReleaseCoverManager";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { getProjectBySlug } from "@/lib/projects";
import { getAdminProjectBySlug } from "@/lib/projectSiteSettings.server";
import {
  enqueueReleaseCoverCleanup,
  MAX_RELEASE_COVER_FILE_BYTES,
  normalizeReleaseCover,
  processReleaseCoverCleanupQueue,
  ReleaseCoverValidationError,
  removeReleaseCoverObject,
  uploadReleaseCoverObject
} from "@/lib/releaseCoverStorage.server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  notice?: string;
  error?: string;
  number?: string;
}>;

type PageParams = Promise<{
  slug: string;
}>;

type ReleaseRow = {
  id: string;
  project_slug: string;
  release_number: number;
  title: string;
  artist_name: string;
  release_date: string | null;
  state: string;
  youtube_video_id: string | null;
  cover_image_url: string | null;
  cover_image_path: string | null;
  summary: string | null;
  is_published: boolean;
};

type RoleTypeRow = {
  code: string;
  label_ko: string;
  category: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
};

type ReleaseRoleRow = {
  id: string;
  release_id: string;
  role_type_code: string;
  state: string;
  is_public: boolean;
  brief: string | null;
  requirements: string | null;
  capacity: number;
  application_deadline: string | null;
  sort_order: number;
};

type ReleaseCreditRow = {
  id: string;
  release_role_id: string;
  display_name: string;
  is_ranch_member: boolean;
  participant_slot: number | null;
  sort_order: number;
};

type ApplicationCountRow = {
  id: string;
  release_role_id: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EDITABLE_ROLE_STATES = ["open", "paused", "filled", "closed"] as const;
const ADDABLE_ROLE_STATES = ["open", "paused", "closed"] as const;
const EDITABLE_RELEASE_STATES = ["draft", "upcoming", "released", "archived"] as const;
type ProjectSlug = string;
const PPP_PROJECT_SLUG = "vintagechord-post-production";

function parseProjectSlug(value: FormDataEntryValue | string | null | undefined): ProjectSlug | null {
  const slug = typeof value === "string" ? value.trim() : "";
  return PROJECT_SLUG_PATTERN.test(slug) ? getProjectBySlug(slug)?.slug ?? null : null;
}

function projectAdminHref(
  projectSlug: ProjectSlug,
  params?: Record<string, string>,
  anchor?: string
) {
  const query = new URLSearchParams(params);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return `/admin/projects/${projectSlug}${suffix}${anchor ? `#${anchor}` : ""}`;
}

async function requireMutationProject(value: string) {
  if (!(await isAdminAuthenticated())) redirect("/admin");

  const projectSlug = parseProjectSlug(value);
  if (!projectSlug) redirect("/admin/projects");

  return projectSlug;
}

function projectLabel(slug: string) {
  return getProjectBySlug(slug)?.shortTitle ?? slug;
}

function formatDate(value: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeZone: "Asia/Seoul"
  }).format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) return "마감 없음";

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul"
  }).format(new Date(value));
}

function formatDateTimeInput(value: string | null) {
  if (!value) return "";

  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Seoul"
  }).format(new Date(value)).replace(" ", "T");
}

function releaseStateLabel(state: string) {
  if (state === "released") return "발매됨";
  if (state === "upcoming") return "진행 중";
  if (state === "draft") return "초안";
  if (state === "archived") return "보관됨";
  return state;
}

function roleStateLabel(state: string) {
  if (state === "open") return "모집 중";
  if (state === "paused") return "일시 중지";
  if (state === "closed") return "마감";
  if (state === "filled") return "참여 확정";
  return state;
}

function releaseNumberLabel(value?: string) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 && number <= 999
    ? String(number).padStart(2, "0")
    : null;
}

function noticeMessage(notice?: string, error?: string, createdNumber?: string) {
  const number = releaseNumberLabel(createdNumber);

  if (notice === "role-saved") return "참여 파트 설정을 저장했습니다.";
  if (notice === "role-added") return "새 참여 파트를 추가했습니다.";
  if (notice === "project-saved") return "프로젝트 운영 상태를 저장했습니다.";
  if (notice === "release-created") {
    return number
      ? `PPP ${number}를 비공개 초안으로 만들었습니다. 대표 이미지와 참여 파트를 이어서 설정해 주세요.`
      : "새 PPP 항목을 비공개 초안으로 만들었습니다.";
  }
  if (notice === "release-existing") {
    return number
      ? `이미 생성된 PPP ${number}로 이동했습니다.`
      : "이미 생성된 PPP 항목으로 이동했습니다.";
  }
  if (notice === "release-saved") return "프로젝트 항목을 저장했습니다.";
  if (notice === "cover-saved") return "대표 이미지를 적용했습니다.";
  if (notice === "cover-removed") return "대표 이미지를 제거했습니다.";
  if (error === "auth") return "관리자 확인이 필요합니다. 다시 로그인해 주세요.";
  if (error === "invalid") return "입력 내용을 확인해 주세요.";
  if (error === "duplicate") return "이미 이 항목에 등록된 참여 파트입니다.";
  if (error === "release-stale") return "다음 PPP 번호가 변경되었습니다. 새로고침된 번호를 확인한 뒤 다시 만들어 주세요.";
  if (error === "release-conflict") return "같은 생성 요청이 다른 내용으로 처리되었습니다. 새로고침 후 다시 시도해 주세요.";
  if (error === "release-number-exhausted") return "사용할 수 있는 PPP 번호가 모두 소진되었습니다.";
  if (error === "release-invalid") return "새 PPP의 제목과 입력 내용을 확인해 주세요.";
  if (error === "release-save") return "새 PPP 초안을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
  if (error === "capacity") return "정원이 모두 확정된 파트는 다시 모집할 수 없습니다.";
  if (error === "release") return "사이트에 공개된 UP NEXT 항목에서만 모집을 열 수 있습니다.";
  if (error === "deadline") return "모집을 열려면 마감 시각을 비우거나 미래로 설정해 주세요.";
  if (error === "not-found") return "대상을 찾을 수 없습니다.";
  if (error === "cover-empty") return "업로드할 이미지를 선택해 주세요.";
  if (error === "cover-size") return "이미지는 3MB 이하만 업로드할 수 있습니다.";
  if (error === "cover-format") return "JPG, PNG, WebP, AVIF 이미지만 업로드할 수 있습니다.";
  if (error === "cover-image") return "올바른 이미지 파일인지 확인해 주세요.";
  if (error === "cover-conflict") return "다른 변경이 먼저 저장되었습니다. 새로고침 후 다시 시도해 주세요.";
  if (error === "save") return "변경사항을 저장하지 못했습니다.";
  if (error === "project-conflict") return "다른 프로젝트 상태 변경이 먼저 저장되었습니다. 최신 내용을 확인해 주세요.";
  if (error === "project-confirm") return "프로젝트를 숨기거나 종료하려면 영향 범위를 확인해 주세요.";
  return "";
}

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: FormDataEntryValue | null, maxLength: number) {
  const text = stringValue(value);
  if (!text) return null;
  if (text.length > maxLength) throw new Error("invalid");
  return text;
}

function parseDeadline(value: FormDataEntryValue | null) {
  const raw = stringValue(value);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) throw new Error("invalid");

  const parsed = new Date(`${raw}:00+09:00`);
  if (Number.isNaN(parsed.getTime())) throw new Error("invalid");
  return parsed.toISOString();
}

async function loadReleaseManagementData(projectSlug: ProjectSlug) {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const [releaseResult, roleTypeResult] = await Promise.all([
    supabase
      .from("music_releases")
      .select(
        "id, project_slug, release_number, title, artist_name, release_date, state, youtube_video_id, cover_image_url, cover_image_path, summary, is_published"
      )
      .eq("project_slug", projectSlug)
      .order("release_number", { ascending: true }),
    supabase
      .from("release_role_types")
      .select("code, label_ko, category, description, is_active, sort_order")
      .order("sort_order", { ascending: true })
  ]);

  const firstError = [releaseResult.error, roleTypeResult.error].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const releases = (releaseResult.data ?? []) as ReleaseRow[];
  const releaseIds = releases.map((release) => release.id);
  let roles: ReleaseRoleRow[] = [];

  if (releaseIds.length > 0) {
    const { data, error } = await supabase
      .from("release_roles")
      .select(
        "id, release_id, role_type_code, state, is_public, brief, requirements, capacity, application_deadline, sort_order"
      )
      .in("release_id", releaseIds)
      .order("sort_order", { ascending: true });

    if (error) throw new Error(error.message);
    roles = (data ?? []) as ReleaseRoleRow[];
  }

  const roleIds = roles.map((role) => role.id);
  let credits: ReleaseCreditRow[] = [];
  let applications: ApplicationCountRow[] = [];

  if (roleIds.length > 0) {
    const [creditResult, applicationResult] = await Promise.all([
      supabase
        .from("release_credits")
        .select(
          "id, release_role_id, display_name, is_ranch_member, participant_slot, sort_order"
        )
        .in("release_role_id", roleIds)
        .order("sort_order", { ascending: true }),
      supabase
        .from("release_participation_applications")
        .select("id, release_role_id")
        .in("release_role_id", roleIds)
        .gt("retention_until", now)
    ]);

    const scopedError = [creditResult.error, applicationResult.error].find(Boolean);
    if (scopedError) throw new Error(scopedError.message);

    credits = (creditResult.data ?? []) as ReleaseCreditRow[];
    applications = (applicationResult.data ?? []) as ApplicationCountRow[];
  }

  return {
    releases,
    roleTypes: (roleTypeResult.data ?? []) as RoleTypeRow[],
    roles,
    credits,
    applications
  };
}

async function releaseBelongsToProject(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  releaseId: string,
  projectSlug: ProjectSlug
) {
  const { data, error } = await supabase
    .from("music_releases")
    .select("id")
    .eq("id", releaseId)
    .eq("project_slug", projectSlug)
    .maybeSingle();

  if (error) throw new Error(`release_project_lookup:${error.code}`);
  return Boolean(data);
}

async function getRoleReleaseIdInProject(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  roleId: string,
  projectSlug: ProjectSlug
) {
  const { data: role, error: roleError } = await supabase
    .from("release_roles")
    .select("release_id")
    .eq("id", roleId)
    .maybeSingle();

  if (roleError) throw new Error(`role_project_lookup:${roleError.code}`);
  if (!role) return null;

  return await releaseBelongsToProject(supabase, role.release_id, projectSlug)
    ? role.release_id
    : null;
}

function revalidateReleaseAdmin(projectSlug: ProjectSlug) {
  revalidatePath("/admin");
  revalidatePath("/admin/projects");
  revalidatePath(`/admin/projects/${projectSlug}`);
  revalidatePath("/admin/release-applications");
  revalidatePath(`/projects/${projectSlug}`);
}

async function updateProjectSettings(routeProjectSlug: string, formData: FormData) {
  "use server";

  const projectSlug = await requireMutationProject(routeProjectSlug);
  const expectedUpdatedAt = stringValue(formData.get("expectedUpdatedAt"));
  const lifecycle = stringValue(formData.get("lifecycle"));
  const sortOrder = Number(stringValue(formData.get("sortOrder")));
  const isPublic = lifecycle === "active" && formData.get("isPublic") === "on";
  const lifecycleConfirmed = formData.get("confirmLifecycle") === "on";

  if (
    !expectedUpdatedAt ||
    !["active", "completed", "archived"].includes(lifecycle) ||
    !Number.isSafeInteger(sortOrder) ||
    sortOrder < 0 ||
    sortOrder > 10000
  ) {
    redirect(projectAdminHref(projectSlug, { error: "invalid" }, "project-settings"));
  }

  const supabase = getSupabaseAdmin();
  const { data: currentSetting, error: settingError } = await supabase
    .from("project_page_settings")
    .select("lifecycle, is_public")
    .eq("project_slug", projectSlug)
    .maybeSingle();

  if (settingError || !currentSetting) {
    redirect(projectAdminHref(projectSlug, { error: settingError ? "save" : "not-found" }, "project-settings"));
  }

  const willStopPublicOperation =
    currentSetting.lifecycle === "active" &&
    currentSetting.is_public &&
    (lifecycle !== "active" || !isPublic);

  if (willStopPublicOperation && !lifecycleConfirmed) {
    redirect(projectAdminHref(projectSlug, { error: "project-confirm" }, "project-settings"));
  }

  const { data, error } = await supabase.rpc("admin_update_project_page_settings", {
    p_project_slug: projectSlug,
    p_expected_updated_at: expectedUpdatedAt,
    p_lifecycle: lifecycle as "active" | "completed" | "archived",
    p_is_public: isPublic,
    p_sort_order: sortOrder
  });

  if (error) {
    console.error("Project settings update failed:", error.code);
    redirect(projectAdminHref(projectSlug, { error: "save" }, "project-settings"));
  }

  if (data?.status !== "updated") {
    const reason = data?.status === "conflict" ? "project-conflict" : data?.status === "not_found" ? "not-found" : "invalid";
    redirect(projectAdminHref(projectSlug, { error: reason }, "project-settings"));
  }

  revalidateReleaseAdmin(projectSlug);
  revalidatePath("/");
  redirect(projectAdminHref(projectSlug, { notice: "project-saved" }, "project-settings"));
}

async function createNextPppRelease(routeProjectSlug: string, formData: FormData) {
  "use server";

  const projectSlug = await requireMutationProject(routeProjectSlug);
  if (projectSlug !== PPP_PROJECT_SLUG) {
    redirect(projectAdminHref(projectSlug, { error: "release-invalid" }));
  }

  const creationId = stringValue(formData.get("creationId")).toLowerCase();
  const expectedReleaseNumber = Number(stringValue(formData.get("expectedReleaseNumber")));
  const title = stringValue(formData.get("title"));
  const artistName = stringValue(formData.get("artistName"));
  const releaseDate = stringValue(formData.get("releaseDate"));
  const youtubeVideoId = stringValue(formData.get("youtubeVideoId"));
  const summary = stringValue(formData.get("summary"));

  if (
    !UUID_PATTERN.test(creationId) ||
    !Number.isSafeInteger(expectedReleaseNumber) ||
    expectedReleaseNumber < 1 ||
    expectedReleaseNumber > 999 ||
    title.length < 1 ||
    title.length > 160 ||
    artistName.length < 1 ||
    artistName.length > 200 ||
    (releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) ||
    (youtubeVideoId && !/^[A-Za-z0-9_-]{11}$/.test(youtubeVideoId)) ||
    summary.length > 1000
  ) {
    redirect(projectAdminHref(projectSlug, { error: "release-invalid" }, "release-creator"));
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("admin_create_next_ppp_release", {
    p_creation_id: creationId,
    p_expected_release_number: expectedReleaseNumber,
    p_title: title,
    p_artist_name: artistName,
    p_release_date: releaseDate || null,
    p_youtube_video_id: youtubeVideoId || null,
    p_summary: summary || null
  });

  if (error) {
    console.error("PPP release creation failed:", error.code);
    redirect(projectAdminHref(projectSlug, { error: "release-save" }, "release-creator"));
  }

  const result = data;

  if (result?.status === "created" || result?.status === "duplicate") {
    if (
      !result.release_id ||
      !UUID_PATTERN.test(result.release_id) ||
      typeof result.release_number !== "number" ||
      !Number.isSafeInteger(result.release_number) ||
      result.release_number < 1 ||
      result.release_number > 999
    ) {
      console.error("PPP release creation returned an invalid result");
      redirect(projectAdminHref(projectSlug, { error: "release-save" }, "release-creator"));
    }

    revalidateReleaseAdmin(projectSlug);
    const notice = result.status === "created" ? "release-created" : "release-existing";
    redirect(projectAdminHref(
      projectSlug,
      { notice, number: String(result.release_number) },
      `release-${result.release_id}`
    ));
  }

  if (result?.status === "stale") {
    revalidatePath(`/admin/projects/${projectSlug}`);
    redirect(projectAdminHref(projectSlug, { error: "release-stale" }, "release-creator"));
  }
  if (result?.status === "conflict") {
    redirect(projectAdminHref(projectSlug, { error: "release-conflict" }, "release-creator"));
  }
  if (result?.status === "number_exhausted") {
    redirect(projectAdminHref(
      projectSlug,
      { error: "release-number-exhausted" },
      "release-creator"
    ));
  }
  if (result?.status === "invalid_input") {
    redirect(projectAdminHref(projectSlug, { error: "release-invalid" }, "release-creator"));
  }

  console.error("PPP release creation returned an unknown status:", result?.status);
  redirect(projectAdminHref(projectSlug, { error: "release-invalid" }, "release-creator"));
}

async function updateMusicRelease(routeProjectSlug: string, formData: FormData) {
  "use server";

  const projectSlug = await requireMutationProject(routeProjectSlug);

  const releaseId = stringValue(formData.get("releaseId")).toLowerCase();
  const releaseAnchor = UUID_PATTERN.test(releaseId) ? `release-${releaseId}` : undefined;
  const title = stringValue(formData.get("title"));
  const artistName = stringValue(formData.get("artistName"));
  const releaseDate = stringValue(formData.get("releaseDate"));
  const state = stringValue(formData.get("state"));
  const youtubeVideoId = stringValue(formData.get("youtubeVideoId"));
  const summary = stringValue(formData.get("summary"));
  const isPublished = formData.get("isPublished") === "on";

  if (
    !UUID_PATTERN.test(releaseId) ||
    title.length < 1 ||
    title.length > 160 ||
    artistName.length < 1 ||
    artistName.length > 200 ||
    (releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) ||
    !EDITABLE_RELEASE_STATES.includes(state as never) ||
    (youtubeVideoId && !/^[A-Za-z0-9_-]{11}$/.test(youtubeVideoId)) ||
    summary.length > 1000
  ) {
    redirect(projectAdminHref(projectSlug, { error: "invalid" }, releaseAnchor));
  }

  const supabase = getSupabaseAdmin();
  let matchesProject = false;

  try {
    matchesProject = await releaseBelongsToProject(supabase, releaseId, projectSlug);
  } catch (lookupError) {
    console.error("Music release project lookup failed:", lookupError);
    redirect(projectAdminHref(projectSlug, { error: "save" }, releaseAnchor));
  }

  if (!matchesProject) {
    redirect(projectAdminHref(projectSlug, { error: "not-found" }));
  }

  const { data, error } = await supabase.rpc("update_music_release_item", {
    p_release_id: releaseId,
    p_title: title,
    p_artist_name: artistName,
    p_release_date: releaseDate || null,
    p_state: state,
    p_youtube_video_id: youtubeVideoId || null,
    p_summary: summary || null,
    p_is_published: isPublished
  });

  if (error) {
    console.error("Music release update failed:", error.code);
    redirect(projectAdminHref(projectSlug, { error: "save" }, releaseAnchor));
  }
  if (data !== "updated") {
    redirect(projectAdminHref(
      projectSlug,
      { error: data === "not_found" ? "not-found" : "invalid" },
      releaseAnchor
    ));
  }

  revalidateReleaseAdmin(projectSlug);
  redirect(projectAdminHref(projectSlug, { notice: "release-saved" }, releaseAnchor));
}

async function discardReleaseCover(path: string, context: string) {
  try {
    const { error } = await removeReleaseCoverObject(path);
    if (!error) return;

    console.error(`${context}: ${path}: ${error.name}`);
    try {
      await enqueueReleaseCoverCleanup(path, error.message);
    } catch (queueError) {
      console.error(`${context} queue failed: ${path}:`, queueError);
    }
  } catch (error) {
    console.error(`${context}: ${path}:`, error);
    try {
      await enqueueReleaseCoverCleanup(path, error);
    } catch (queueError) {
      console.error(`${context} queue failed: ${path}:`, queueError);
    }
  }
}

async function uploadMusicReleaseCover(routeProjectSlug: string, formData: FormData) {
  "use server";

  const projectSlug = await requireMutationProject(routeProjectSlug);

  const releaseId = stringValue(formData.get("releaseId")).toLowerCase();
  const file = formData.get("coverImage");
  const releaseAnchor = UUID_PATTERN.test(releaseId) ? `release-${releaseId}` : undefined;

  if (!UUID_PATTERN.test(releaseId)) {
    redirect(projectAdminHref(projectSlug, { error: "invalid" }));
  }
  if (!(file instanceof File) || file.size === 0) {
    redirect(projectAdminHref(projectSlug, { error: "cover-empty" }, releaseAnchor));
  }

  let normalizedImage: Buffer;

  try {
    normalizedImage = await normalizeReleaseCover(file);
  } catch (error) {
    if (error instanceof ReleaseCoverValidationError) {
      const reason = error.code === "too_large"
        ? "cover-size"
        : error.code === "invalid_type"
          ? "cover-format"
          : error.code === "empty"
            ? "cover-empty"
            : "cover-image";
      redirect(projectAdminHref(projectSlug, { error: reason }, releaseAnchor));
    }

    console.error("Release cover normalization failed");
    redirect(projectAdminHref(projectSlug, { error: "cover-image" }, releaseAnchor));
  }

  const supabase = getSupabaseAdmin();
  const { data: current, error: lookupError } = await supabase
    .from("music_releases")
    .select("id, cover_image_path, updated_at")
    .eq("id", releaseId)
    .eq("project_slug", projectSlug)
    .maybeSingle();

  if (lookupError) {
    console.error("Release cover lookup failed:", lookupError.code);
    redirect(projectAdminHref(projectSlug, { error: "save" }, releaseAnchor));
  }
  if (!current) redirect(projectAdminHref(projectSlug, { error: "not-found" }));

  let uploaded: Awaited<ReturnType<typeof uploadReleaseCoverObject>>;

  try {
    uploaded = await uploadReleaseCoverObject(current.id, normalizedImage);
  } catch {
    console.error("Release cover storage upload failed");
    redirect(projectAdminHref(projectSlug, { error: "save" }, releaseAnchor));
  }

  const updateQuery = supabase
    .from("music_releases")
    .update({
      cover_image_url: uploaded.publicUrl,
      cover_image_path: uploaded.path
    })
    .eq("id", releaseId)
    .eq("project_slug", projectSlug);
  const guardedUpdate = current.cover_image_path
    ? updateQuery.eq("cover_image_path", current.cover_image_path)
    : updateQuery.is("cover_image_path", null);
  const { data: updated, error: updateError } = await guardedUpdate
    .eq("updated_at", current.updated_at)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    await discardReleaseCover(uploaded.path, "Release cover rollback failed");
    if (updateError) {
      console.error("Release cover database update failed:", updateError.code);
      redirect(projectAdminHref(projectSlug, { error: "save" }, releaseAnchor));
    }
    redirect(projectAdminHref(projectSlug, { error: "cover-conflict" }, releaseAnchor));
  }

  if (current.cover_image_path && current.cover_image_path !== uploaded.path) {
    await discardReleaseCover(current.cover_image_path, "Previous release cover cleanup failed");
  }

  revalidateReleaseAdmin(projectSlug);
  redirect(projectAdminHref(projectSlug, { notice: "cover-saved" }, releaseAnchor));
}

async function removeMusicReleaseCover(routeProjectSlug: string, formData: FormData) {
  "use server";

  const projectSlug = await requireMutationProject(routeProjectSlug);

  const releaseId = stringValue(formData.get("releaseId")).toLowerCase();
  const releaseAnchor = UUID_PATTERN.test(releaseId) ? `release-${releaseId}` : undefined;

  if (!UUID_PATTERN.test(releaseId)) {
    redirect(projectAdminHref(projectSlug, { error: "invalid" }));
  }

  const supabase = getSupabaseAdmin();
  const { data: current, error: lookupError } = await supabase
    .from("music_releases")
    .select("id, youtube_video_id, cover_image_path, updated_at")
    .eq("id", releaseId)
    .eq("project_slug", projectSlug)
    .maybeSingle();

  if (lookupError) {
    console.error("Release cover lookup failed:", lookupError.code);
    redirect(projectAdminHref(projectSlug, { error: "save" }, releaseAnchor));
  }
  if (!current) redirect(projectAdminHref(projectSlug, { error: "not-found" }));
  if (!current.cover_image_path) {
    redirect(projectAdminHref(projectSlug, { error: "cover-conflict" }, releaseAnchor));
  }

  const fallbackUrl = current.youtube_video_id
    ? `https://i.ytimg.com/vi/${current.youtube_video_id}/hqdefault.jpg`
    : null;
  const { data: updated, error: updateError } = await supabase
    .from("music_releases")
    .update({
      cover_image_url: fallbackUrl,
      cover_image_path: null
    })
    .eq("id", releaseId)
    .eq("project_slug", projectSlug)
    .eq("cover_image_path", current.cover_image_path)
    .eq("updated_at", current.updated_at)
    .select("id")
    .maybeSingle();

  if (updateError) {
    console.error("Release cover removal update failed:", updateError.code);
    redirect(projectAdminHref(projectSlug, { error: "save" }, releaseAnchor));
  }
  if (!updated) {
    redirect(projectAdminHref(projectSlug, { error: "cover-conflict" }, releaseAnchor));
  }

  await discardReleaseCover(current.cover_image_path, "Removed release cover cleanup failed");
  revalidateReleaseAdmin(projectSlug);
  redirect(projectAdminHref(projectSlug, { notice: "cover-removed" }, releaseAnchor));
}

async function updateRoleConfiguration(routeProjectSlug: string, formData: FormData) {
  "use server";

  const projectSlug = await requireMutationProject(routeProjectSlug);

  const roleId = stringValue(formData.get("roleId"));
  const releaseId = stringValue(formData.get("releaseId")).toLowerCase();
  const releaseAnchor = UUID_PATTERN.test(releaseId) ? `release-${releaseId}` : undefined;
  const state = stringValue(formData.get("state"));
  const capacity = Number(stringValue(formData.get("capacity")));
  const isPublic = formData.get("isPublic") === "on";
  let brief: string | null;
  let requirements: string | null;
  let applicationDeadline: string | null;

  try {
    brief = optionalText(formData.get("brief"), 1000);
    requirements = optionalText(formData.get("requirements"), 2000);
    applicationDeadline = parseDeadline(formData.get("applicationDeadline"));
  } catch {
    redirect(projectAdminHref(projectSlug, { error: "invalid" }, releaseAnchor));
  }

  if (
    !UUID_PATTERN.test(roleId) ||
    !UUID_PATTERN.test(releaseId) ||
    !EDITABLE_ROLE_STATES.includes(state as never) ||
    !Number.isSafeInteger(capacity) ||
    capacity < 1 ||
    capacity > 100
  ) {
    redirect(projectAdminHref(projectSlug, { error: "invalid" }, releaseAnchor));
  }

  const supabase = getSupabaseAdmin();
  let roleReleaseId: string | null = null;

  try {
    roleReleaseId = await getRoleReleaseIdInProject(supabase, roleId, projectSlug);
  } catch (lookupError) {
    console.error("Release role project lookup failed:", lookupError);
    redirect(projectAdminHref(projectSlug, { error: "save" }, releaseAnchor));
  }

  if (!roleReleaseId || roleReleaseId !== releaseId) {
    redirect(projectAdminHref(projectSlug, { error: "not-found" }));
  }

  const { data, error } = await supabase.rpc("update_release_role_configuration", {
    p_role_id: roleId,
    p_state: state,
    p_is_public: isPublic,
    p_brief: brief,
    p_requirements: requirements,
    p_application_deadline: applicationDeadline,
    p_capacity: capacity
  });

  if (error) {
    console.error("Release role configuration update failed:", error.code);
    redirect(projectAdminHref(projectSlug, { error: "save" }, releaseAnchor));
  }
  if (data !== "updated") {
    const reason = data === "capacity_reached" || data === "capacity_below_credits"
      ? "capacity"
      : data === "release_unavailable"
        ? "release"
        : data === "deadline_expired"
          ? "deadline"
          : data === "not_found"
            ? "not-found"
            : "invalid";
    redirect(projectAdminHref(projectSlug, { error: reason }, releaseAnchor));
  }

  revalidateReleaseAdmin(projectSlug);
  redirect(projectAdminHref(projectSlug, { notice: "role-saved" }, releaseAnchor));
}

async function addReleaseRole(routeProjectSlug: string, formData: FormData) {
  "use server";

  const projectSlug = await requireMutationProject(routeProjectSlug);

  const releaseId = stringValue(formData.get("releaseId")).toLowerCase();
  const releaseAnchor = UUID_PATTERN.test(releaseId) ? `release-${releaseId}` : undefined;
  const roleTypeCode = stringValue(formData.get("roleTypeCode"));
  const state = stringValue(formData.get("state"));

  let brief: string | null;
  let requirements: string | null;
  let applicationDeadline: string | null;
  try {
    brief = optionalText(formData.get("brief"), 1000);
    requirements = optionalText(formData.get("requirements"), 2000);
    applicationDeadline = parseDeadline(formData.get("applicationDeadline"));
  } catch {
    redirect(projectAdminHref(projectSlug, { error: "invalid" }, releaseAnchor));
  }

  if (
    !UUID_PATTERN.test(releaseId) ||
    !/^[a-z][a-z0-9_]{1,39}$/.test(roleTypeCode) ||
    !ADDABLE_ROLE_STATES.includes(state as never)
  ) {
    redirect(projectAdminHref(projectSlug, { error: "invalid" }, releaseAnchor));
  }

  const supabase = getSupabaseAdmin();
  let matchesProject = false;

  try {
    matchesProject = await releaseBelongsToProject(supabase, releaseId, projectSlug);
  } catch (lookupError) {
    console.error("Release role parent project lookup failed:", lookupError);
    redirect(projectAdminHref(projectSlug, { error: "save" }, releaseAnchor));
  }

  if (!matchesProject) {
    redirect(projectAdminHref(projectSlug, { error: "not-found" }));
  }

  const { data: roleType, error: roleTypeError } = await supabase
    .from("release_role_types")
    .select("code, sort_order")
    .eq("code", roleTypeCode)
    .eq("is_active", true)
    .maybeSingle();

  if (roleTypeError) {
    console.error("Release role type lookup failed:", roleTypeError.message);
    redirect(projectAdminHref(projectSlug, { error: "save" }, releaseAnchor));
  }
  if (!roleType) redirect(projectAdminHref(projectSlug, { error: "invalid" }, releaseAnchor));

  const { error } = await supabase.from("release_roles").insert({
    release_id: releaseId,
    role_type_code: roleTypeCode,
    state,
    is_public: true,
    brief,
    requirements,
    capacity: 1,
    application_deadline: applicationDeadline,
    sort_order: roleType.sort_order
  });

  if (error) {
    console.error("Release role insert failed:", error.message);
    const reason = error.code === "23505" ? "duplicate" : "save";
    redirect(projectAdminHref(projectSlug, { error: reason }, releaseAnchor));
  }

  revalidateReleaseAdmin(projectSlug);
  redirect(projectAdminHref(projectSlug, { notice: "role-added" }, releaseAnchor));
}

export default async function AdminProjectPage({
  params,
  searchParams
}: {
  params: PageParams;
  searchParams: SearchParams;
}) {
  if (!(await isAdminAuthenticated())) redirect("/admin");

  const [{ slug }, { notice, error, number }] = await Promise.all([params, searchParams]);
  const projectSlug = parseProjectSlug(slug);
  if (!projectSlug) notFound();

  const project = await getAdminProjectBySlug(projectSlug);
  if (!project) notFound();

  try {
    await processReleaseCoverCleanupQueue(5);
  } catch (cleanupError) {
    console.error("Release cover cleanup queue processing failed:", cleanupError);
  }

  const { releases, roleTypes, roles, credits, applications } =
    await loadReleaseManagementData(projectSlug);
  const message = noticeMessage(notice, error, number);
  const roleTypeByCode = new Map(roleTypes.map((item) => [item.code, item]));
  const highestPppReleaseNumber = releases.reduce(
    (highest, release) => release.project_slug === "vintagechord-post-production"
      ? Math.max(highest, release.release_number)
      : highest,
    0
  );
  const nextPppReleaseNumber = highestPppReleaseNumber < 999
    ? highestPppReleaseNumber + 1
    : null;
  const nextPppReleaseLabel = nextPppReleaseNumber
    ? String(nextPppReleaseNumber).padStart(2, "0")
    : "번호 소진";
  const creationId = randomUUID();
  const nowTimestamp = Date.now();
  const createReleaseAction = createNextPppRelease.bind(null, projectSlug);
  const updateReleaseAction = updateMusicRelease.bind(null, projectSlug);
  const uploadCoverAction = uploadMusicReleaseCover.bind(null, projectSlug);
  const removeCoverAction = removeMusicReleaseCover.bind(null, projectSlug);
  const updateRoleAction = updateRoleConfiguration.bind(null, projectSlug);
  const addRoleAction = addReleaseRole.bind(null, projectSlug);
  const updateProjectSettingsAction = updateProjectSettings.bind(null, projectSlug);
  const creatorHasError = [
    "release-stale",
    "release-conflict",
    "release-number-exhausted",
    "release-invalid",
    "release-save"
  ].includes(error ?? "");

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <p className="admin-eyebrow">PROJECTS / {project.shortTitle}</p>
          <h1>{project.shortTitle} 관리</h1>
        </div>
        <div className="admin-actions">
          <Link href="/admin/projects" prefetch={false}>프로젝트 목록</Link>
          <Link href={`/admin/release-applications?project=${projectSlug}`} prefetch={false}>이 프로젝트 신청</Link>
        </div>
      </header>

      <div className="admin-management-page">
        {message ? (
          <div className="admin-alert" role={error ? "alert" : "status"} aria-live={error ? "assertive" : "polite"}>
            {message}
          </div>
        ) : null}

        <section
          className="admin-project-settings-panel"
          id="project-settings"
          aria-labelledby="project-settings-title"
        >
          <div className="admin-project-settings-copy">
            <p className="admin-eyebrow">PROJECT LIFECYCLE</p>
            <h2 id="project-settings-title">프로젝트 운영 상태</h2>
            <p>
              완료 또는 보관으로 전환하면 메인과 헤더에서 즉시 사라지고, 열려 있던 모집은
              마감됩니다. 기존 음원·신청·크레딧 기록은 삭제하지 않습니다.
            </p>
          </div>
          <form className="admin-project-settings-form" action={updateProjectSettingsAction}>
            <input type="hidden" name="expectedUpdatedAt" value={project.settingUpdatedAt} />
            <label>
              <span>수명주기</span>
              <select name="lifecycle" defaultValue={project.lifecycle}>
                <option value="active">진행 중</option>
                <option value="completed">완료</option>
                <option value="archived">보관</option>
              </select>
            </label>
            <label>
              <span>메인 정렬 순서</span>
              <input name="sortOrder" type="number" min="0" max="10000" step="1" defaultValue={project.sortOrder} required />
            </label>
            <label className="admin-check-field">
              <input name="isPublic" type="checkbox" defaultChecked={project.isPublic} />
              <span>사이트에 프로젝트 공개</span>
            </label>
            <label className="admin-check-field admin-project-stop-confirm">
              <input name="confirmLifecycle" type="checkbox" />
              <span>완료·보관·숨김 전환 시 공개 페이지와 모집이 종료되는 것을 확인했습니다.</span>
            </label>
            <button type="submit">운영 상태 저장</button>
          </form>
        </section>

        <section className="admin-management-section" aria-labelledby="release-list-title">
          <div className="admin-table-heading">
            <div>
              <p className="admin-eyebrow">PROJECT PARTICIPATION</p>
              <h2 id="release-list-title">음원과 참여 파트</h2>
            </div>
            <span>항목 {releases.length}개</span>
          </div>

          {projectSlug === PPP_PROJECT_SLUG ? (
          <details className="admin-release-creator" id="release-creator" open={creatorHasError}>
            <summary>
              <span>
                <small>NEW PPP CHANNEL</small>
                <strong>다음 UP NEXT · {nextPppReleaseLabel}</strong>
              </span>
              <b aria-hidden="true">+</b>
            </summary>
            <div className="admin-release-creator-body">
              <div className="admin-release-creator-intro">
                <p id="release-creator-help">
                  {nextPppReleaseNumber
                    ? `PPP ${nextPppReleaseLabel}를 비공개 초안으로 만든 뒤 필요한 준비만 이어서 완료하세요.`
                    : "PPP 번호가 모두 소진되어 새 초안을 만들 수 없습니다."}
                </p>
                <ol aria-label="새 PPP 공개 순서">
                  <li><span>01</span> 기본 정보</li>
                  <li><span>02</span> 대표 이미지</li>
                  <li><span>03</span> 참여 파트</li>
                  <li><span>04</span> 사이트 공개</li>
                </ol>
              </div>

              {nextPppReleaseNumber ? (
                <form
                  className="admin-add-role-form admin-add-release-form"
                  action={createReleaseAction}
                  aria-describedby="release-creator-help"
                >
                  <input type="hidden" name="creationId" value={creationId} />
                  <input type="hidden" name="expectedReleaseNumber" value={nextPppReleaseNumber} />
                  <label className="admin-form-field is-wide">
                    <span>제목</span>
                    <input name="title" type="text" maxLength={160} required />
                  </label>
                  <label className="admin-form-field is-wide">
                    <span>아티스트</span>
                    <input name="artistName" type="text" maxLength={200} defaultValue="빈티지코드" required />
                  </label>
                  <label className="admin-form-field">
                    <span>공개 예정일</span>
                    <input name="releaseDate" type="date" />
                  </label>
                  <label className="admin-form-field is-wide">
                    <span>YouTube 영상 ID</span>
                    <input
                      name="youtubeVideoId"
                      type="text"
                      maxLength={11}
                      pattern="[A-Za-z0-9_-]{11}"
                      placeholder="11자리 영상 ID"
                    />
                  </label>
                  <label className="admin-form-field is-wide">
                    <span>짧은 표기</span>
                    <input name="summary" type="text" maxLength={1000} placeholder="Prod. / 메모" />
                  </label>
                  <AdminActionButton pendingLabel={`PPP ${nextPppReleaseLabel} 만드는 중…`}>
                    PPP {nextPppReleaseLabel} 초안 만들기
                  </AdminActionButton>
                </form>
              ) : (
                <p className="admin-release-creator-exhausted" role="status">
                  사용할 수 있는 PPP 번호가 모두 소진되어 새 항목을 만들 수 없습니다.
                </p>
              )}
            </div>
          </details>
          ) : null}

          {releases.length === 0 ? (
            <div className="admin-empty">등록된 프로젝트 항목이 없습니다.</div>
          ) : (
            <div className="admin-release-list">
              {releases.map((release) => {
                const releaseRoles = roles.filter((role) => role.release_id === release.id);
                const existingRoleCodes = new Set(
                  releaseRoles.map((role) => role.role_type_code)
                );
                const availableRoleTypes = roleTypes.filter(
                  (roleType) => roleType.is_active && !existingRoleCodes.has(roleType.code)
                );
                const publicRoles = releaseRoles.filter((role) => (
                  role.is_public && roleTypeByCode.get(role.role_type_code)?.is_active
                ));
                const publicRoleCount = publicRoles.length;
                const openPublicRoleCount = publicRoles.filter((role) => (
                  role.state === "open" &&
                  (!role.application_deadline || Date.parse(role.application_deadline) > nowTimestamp)
                )).length;
                const releaseAnchorId = `release-${release.id}`;
                const releaseTitleId = `${releaseAnchorId}-title`;
                const releaseLabel = `${projectLabel(release.project_slug)} ${String(release.release_number).padStart(2, "0")}`;

                return (
                  <article
                    className="admin-release-card"
                    id={releaseAnchorId}
                    aria-labelledby={releaseTitleId}
                    tabIndex={-1}
                    key={release.id}
                  >
                    <header>
                      <div className="admin-release-title">
                        <p>
                          {projectLabel(release.project_slug)} · {String(release.release_number).padStart(2, "0")} · {release.artist_name}
                        </p>
                        <h3 id={releaseTitleId}>{release.title}</h3>
                      </div>
                      <div className="admin-release-meta" aria-label="프로젝트 항목 상태">
                        <span
                          className="admin-status-badge"
                          data-status={release.state}
                        >
                          {releaseStateLabel(release.state)}
                        </span>
                        <span>{formatDate(release.release_date)}</span>
                        {!release.is_published ? <span>비공개</span> : null}
                      </div>
                    </header>

                    <ul className="admin-release-readiness" aria-label={`${releaseLabel} 준비 상태`}>
                      <li data-ready={Boolean(release.cover_image_url)}>
                        대표 이미지 <strong>{release.cover_image_url ? "완료" : "없음"}</strong>
                      </li>
                      <li data-ready={publicRoleCount > 0}>
                        공개 파트 <strong>{publicRoleCount}</strong>
                      </li>
                      <li data-ready={openPublicRoleCount > 0}>
                        모집 중 <strong>{openPublicRoleCount}</strong>
                      </li>
                      <li data-ready={release.is_published}>
                        <strong>{release.is_published ? "사이트 공개" : "사이트 비공개"}</strong>
                      </li>
                    </ul>

                    <AdminReleaseCoverManager
                      releaseId={release.id}
                      releaseNumber={release.release_number}
                      releaseTitle={release.title}
                      currentImageUrl={release.cover_image_url}
                      hasManagedCover={Boolean(release.cover_image_path)}
                      maxFileSizeMb={Math.round(MAX_RELEASE_COVER_FILE_BYTES / 1024 / 1024)}
                      uploadAction={uploadCoverAction}
                      removeAction={removeCoverAction}
                    />

                    <details className="admin-release-edit">
                      <summary aria-label={`${releaseLabel} 항목 정보 수정`}>항목 정보 수정</summary>
                      <form className="admin-add-role-form" action={updateReleaseAction}>
                        <input type="hidden" name="releaseId" value={release.id} />
                        <label className="admin-form-field">
                          <span>상태</span>
                          <select name="state" defaultValue={release.state} required>
                            <option value="upcoming">진행 중</option>
                            <option value="released">발매됨</option>
                            <option value="draft">초안</option>
                            <option value="archived">보관됨</option>
                          </select>
                        </label>
                        <label className="admin-form-field">
                          <span>공개일</span>
                          <input name="releaseDate" type="date" defaultValue={release.release_date ?? ""} />
                        </label>
                        <label className="admin-form-field is-wide">
                          <span>제목</span>
                          <input name="title" type="text" maxLength={160} defaultValue={release.title} required />
                        </label>
                        <label className="admin-form-field is-wide">
                          <span>아티스트</span>
                          <input name="artistName" type="text" maxLength={200} defaultValue={release.artist_name} required />
                        </label>
                        <label className="admin-form-field is-wide">
                          <span>YouTube 영상 ID</span>
                          <input name="youtubeVideoId" type="text" maxLength={11} defaultValue={release.youtube_video_id ?? ""} />
                        </label>
                        <label className="admin-form-field is-wide">
                          <span>짧은 표기</span>
                          <input name="summary" type="text" maxLength={1000} defaultValue={release.summary ?? ""} />
                        </label>
                        <label className="admin-check-field">
                          <input name="isPublished" type="checkbox" defaultChecked={release.is_published} />
                          <span>사이트에 공개</span>
                        </label>
                        <button className="admin-form-button" type="submit">항목 저장</button>
                      </form>
                    </details>

                    {releaseRoles.length === 0 ? (
                      <div className="admin-empty admin-release-empty-help">
                        <strong>참여 파트가 없습니다.</strong>
                        <span>아래에서 아트워크, 소개글, 뮤직비디오 등 첫 파트를 추가하세요. 공개된 ‘모집 중’ 파트만 참여 희망 버튼이 나타납니다.</span>
                      </div>
                    ) : (
                      <div className="admin-lead-list">
                        {releaseRoles.map((role) => {
                          const roleType = roleTypeByCode.get(role.role_type_code);
                          const roleCredits = credits.filter(
                            (credit) => credit.release_role_id === role.id
                          );
                          const applicationCount = applications.filter(
                            (application) => application.release_role_id === role.id
                          ).length;
                          const deadlineExpired = role.application_deadline
                            ? Date.parse(role.application_deadline) <= Date.now()
                            : false;

                          return (
                            <section className="admin-lead-row" key={role.id}>
                              <div>
                                <h3>{roleType?.label_ko ?? role.role_type_code}</h3>
                                <p>{roleType?.category ?? "creative"}</p>
                              </div>

                              <div className="admin-lead-copy">
                                <div className="admin-lead-meta">
                                  <span
                                    className="admin-status-badge"
                                    data-status={role.state === "open" && deadlineExpired ? "closed" : role.state}
                                  >
                                    {role.state === "open" && deadlineExpired
                                      ? "마감일 지남"
                                      : roleStateLabel(role.state)}
                                  </span>
                                  <span>정원 {role.capacity}명</span>
                                  <span>신청 {applicationCount}건</span>
                                  <span>{formatDateTime(role.application_deadline)}</span>
                                  {!role.is_public ? <span>비공개</span> : null}
                                  {roleCredits.map((credit) => (
                                    <span className="admin-credit-chip" key={credit.id}>
                                      {credit.display_name}
                                      {credit.is_ranch_member ? " · 목장 멤버" : ""}
                                    </span>
                                  ))}
                                </div>
                                {role.brief ? <p>{role.brief}</p> : null}
                                {role.requirements ? <p>지원 조건 · {role.requirements}</p> : null}
                              </div>

                              <div className="admin-role-actions">
                                {applicationCount > 0 ? (
                                  <Link
                                    className="admin-form-button"
                                    href={`/admin/release-applications?release=${encodeURIComponent(release.id)}&role=${encodeURIComponent(role.role_type_code)}`}
                                    prefetch={false}
                                  >
                                    신청 보기
                                  </Link>
                                ) : null}
                              </div>

                              <details className="admin-release-edit admin-role-edit">
                                <summary aria-label={`${releaseLabel} ${roleType?.label_ko ?? role.role_type_code} 파트 설정`}>
                                  파트 설정
                                </summary>
                                <form className="admin-add-role-form" action={updateRoleAction}>
                                  <input type="hidden" name="roleId" value={role.id} />
                                  <input type="hidden" name="releaseId" value={release.id} />
                                  <label className="admin-form-field">
                                    <span>{roleType?.label_ko ?? role.role_type_code} 상태</span>
                                    <select name="state" defaultValue={role.state} required>
                                      {role.state === "filled" ? (
                                        <option value="filled">참여 확정</option>
                                      ) : null}
                                      <option value="open">모집 중</option>
                                      <option value="paused">일시 중지</option>
                                      <option value="closed">마감</option>
                                    </select>
                                  </label>
                                  <label className="admin-form-field">
                                    <span>정원</span>
                                    <input name="capacity" type="number" min="1" max="100" defaultValue={role.capacity} required />
                                  </label>
                                  <label className="admin-form-field">
                                    <span>신청 마감 (KST)</span>
                                    <input
                                      name="applicationDeadline"
                                      type="datetime-local"
                                      defaultValue={formatDateTimeInput(role.application_deadline)}
                                    />
                                  </label>
                                  <label className="admin-form-field is-wide">
                                    <span>간단한 작업 안내</span>
                                    <input name="brief" type="text" maxLength={1000} defaultValue={role.brief ?? ""} />
                                  </label>
                                  <label className="admin-form-field is-wide">
                                    <span>지원 조건</span>
                                    <input name="requirements" type="text" maxLength={2000} defaultValue={role.requirements ?? ""} />
                                  </label>
                                  <label className="admin-check-field">
                                    <input name="isPublic" type="checkbox" defaultChecked={role.is_public} />
                                    <span>사이트에 파트 공개</span>
                                  </label>
                                  <button className="admin-form-button" type="submit">파트 저장</button>
                                </form>
                              </details>
                            </section>
                          );
                        })}
                      </div>
                    )}

                    {availableRoleTypes.length > 0 ? (
                      <form className="admin-add-role-form" action={addRoleAction}>
                        <input type="hidden" name="releaseId" value={release.id} />
                        <label className="admin-form-field">
                          <span>새 참여 파트</span>
                          <select name="roleTypeCode" required defaultValue="">
                            <option value="" disabled>파트 선택</option>
                            {availableRoleTypes.map((roleType) => (
                              <option key={roleType.code} value={roleType.code}>
                                {roleType.label_ko}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="admin-form-field">
                          <span>초기 상태</span>
                          <select name="state" defaultValue="paused">
                            <option value="paused">일시 중지</option>
                            <option value="open">모집 중</option>
                            <option value="closed">마감</option>
                          </select>
                        </label>
                        <label className="admin-form-field">
                          <span>신청 마감 (KST)</span>
                          <input name="applicationDeadline" type="datetime-local" />
                        </label>
                        <label className="admin-form-field is-wide">
                          <span>간단한 작업 안내</span>
                          <input name="brief" type="text" maxLength={1000} placeholder="요청할 결과물" />
                        </label>
                        <label className="admin-form-field is-wide">
                          <span>지원 조건</span>
                          <input name="requirements" type="text" maxLength={2000} placeholder="포트폴리오 등" />
                        </label>
                        <button className="admin-form-button" type="submit">
                          파트 추가
                        </button>
                      </form>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
