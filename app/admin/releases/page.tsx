import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import AdminReleaseCoverManager from "@/app/components/AdminReleaseCoverManager";
import { isAdminAuthenticated } from "@/lib/adminAuth";
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
const EDITABLE_ROLE_STATES = ["open", "paused", "filled", "closed"] as const;
const EDITABLE_RELEASE_STATES = ["draft", "upcoming", "released", "archived"] as const;
const PROJECTS = [
  { slug: "vintagechord-post-production", label: "PPP" },
  { slug: "ibyeol-ui-dosu", label: "이별의 도수" }
] as const;

function projectLabel(slug: string) {
  return PROJECTS.find((project) => project.slug === slug)?.label ?? slug;
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
  if (state === "upcoming") return "공개 예정";
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

function noticeMessage(notice?: string, error?: string) {
  if (notice === "role-saved") return "참여 파트 설정을 저장했습니다.";
  if (notice === "role-added") return "새 참여 파트를 추가했습니다.";
  if (notice === "release-added") return "새 프로젝트 항목을 추가했습니다.";
  if (notice === "release-saved") return "프로젝트 항목을 저장했습니다.";
  if (notice === "cover-saved") return "대표 이미지를 적용했습니다.";
  if (notice === "cover-removed") return "대표 이미지를 제거했습니다.";
  if (error === "auth") return "관리자 확인이 필요합니다. 다시 로그인해 주세요.";
  if (error === "invalid") return "입력한 참여 파트 정보를 확인해 주세요.";
  if (error === "duplicate") return "이미 이 항목에 등록된 참여 파트입니다.";
  if (error === "release-duplicate") return "같은 프로젝트 번호가 이미 등록되어 있습니다.";
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

async function loadReleaseManagementData() {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const [releaseResult, roleTypeResult, roleResult, creditResult, applicationResult] =
    await Promise.all([
      supabase
        .from("music_releases")
        .select(
          "id, project_slug, release_number, title, artist_name, release_date, state, youtube_video_id, cover_image_url, cover_image_path, summary, is_published"
        )
        .order("project_slug", { ascending: true })
        .order("release_number", { ascending: true }),
      supabase
        .from("release_role_types")
        .select("code, label_ko, category, description, is_active, sort_order")
        .order("sort_order", { ascending: true }),
      supabase
        .from("release_roles")
        .select(
          "id, release_id, role_type_code, state, is_public, brief, requirements, capacity, application_deadline, sort_order"
        )
        .order("sort_order", { ascending: true }),
      supabase
        .from("release_credits")
        .select(
          "id, release_role_id, display_name, is_ranch_member, participant_slot, sort_order"
        )
        .order("sort_order", { ascending: true }),
      supabase
        .from("release_participation_applications")
        .select("id, release_role_id")
        .gt("retention_until", now)
    ]);

  const firstError = [
    releaseResult.error,
    roleTypeResult.error,
    roleResult.error,
    creditResult.error,
    applicationResult.error
  ].find(Boolean);

  if (firstError) throw new Error(firstError.message);

  return {
    releases: (releaseResult.data ?? []) as ReleaseRow[],
    roleTypes: (roleTypeResult.data ?? []) as RoleTypeRow[],
    roles: (roleResult.data ?? []) as ReleaseRoleRow[],
    credits: (creditResult.data ?? []) as ReleaseCreditRow[],
    applications: (applicationResult.data ?? []) as ApplicationCountRow[]
  };
}

function revalidateReleaseAdmin() {
  revalidatePath("/admin");
  revalidatePath("/admin/releases");
  revalidatePath("/admin/release-applications");
  PROJECTS.forEach((project) => revalidatePath(`/projects/${project.slug}`));
}

async function addMusicRelease(formData: FormData) {
  "use server";

  if (!(await isAdminAuthenticated())) redirect("/admin/releases?error=auth");

  const projectSlug = stringValue(formData.get("projectSlug"));
  const releaseNumber = Number(stringValue(formData.get("releaseNumber")));
  const title = stringValue(formData.get("title"));
  const artistName = stringValue(formData.get("artistName"));
  const releaseDate = stringValue(formData.get("releaseDate"));
  const state = stringValue(formData.get("state"));
  const youtubeVideoId = stringValue(formData.get("youtubeVideoId"));
  const summary = stringValue(formData.get("summary"));
  const isPublished = formData.get("isPublished") === "on";

  if (
    !PROJECTS.some((project) => project.slug === projectSlug) ||
    !Number.isSafeInteger(releaseNumber) ||
    releaseNumber < 1 ||
    releaseNumber > 999 ||
    title.length < 1 ||
    title.length > 160 ||
    artistName.length < 1 ||
    artistName.length > 200 ||
    (releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) ||
    !EDITABLE_RELEASE_STATES.includes(state as never) ||
    (youtubeVideoId && !/^[A-Za-z0-9_-]{11}$/.test(youtubeVideoId)) ||
    summary.length > 1000
  ) {
    redirect("/admin/releases?error=invalid");
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("music_releases").insert({
    project_slug: projectSlug,
    release_number: releaseNumber,
    title,
    artist_name: artistName,
    release_date: releaseDate || null,
    state,
    youtube_video_id: youtubeVideoId || null,
    cover_image_url: youtubeVideoId
      ? `https://i.ytimg.com/vi/${youtubeVideoId}/hqdefault.jpg`
      : null,
    summary: summary || null,
    is_published: isPublished
  });

  if (error) {
    console.error("Music release insert failed:", error.code);
    redirect(`/admin/releases?error=${error.code === "23505" ? "release-duplicate" : "save"}`);
  }

  revalidateReleaseAdmin();
  redirect("/admin/releases?notice=release-added");
}

async function updateMusicRelease(formData: FormData) {
  "use server";

  if (!(await isAdminAuthenticated())) redirect("/admin/releases?error=auth");

  const releaseId = stringValue(formData.get("releaseId")).toLowerCase();
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
    redirect("/admin/releases?error=invalid");
  }

  const supabase = getSupabaseAdmin();
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
    redirect("/admin/releases?error=save");
  }
  if (data !== "updated") {
    redirect(`/admin/releases?error=${data === "not_found" ? "not-found" : "invalid"}`);
  }

  revalidateReleaseAdmin();
  redirect("/admin/releases?notice=release-saved");
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

async function uploadMusicReleaseCover(formData: FormData) {
  "use server";

  if (!(await isAdminAuthenticated())) redirect("/admin/releases?error=auth");

  const releaseId = stringValue(formData.get("releaseId")).toLowerCase();
  const file = formData.get("coverImage");

  if (!UUID_PATTERN.test(releaseId)) {
    redirect("/admin/releases?error=invalid");
  }
  if (!(file instanceof File) || file.size === 0) {
    redirect("/admin/releases?error=cover-empty");
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
      redirect(`/admin/releases?error=${reason}`);
    }

    console.error("Release cover normalization failed");
    redirect("/admin/releases?error=cover-image");
  }

  const supabase = getSupabaseAdmin();
  const { data: current, error: lookupError } = await supabase
    .from("music_releases")
    .select("id, cover_image_path, updated_at")
    .eq("id", releaseId)
    .maybeSingle();

  if (lookupError) {
    console.error("Release cover lookup failed:", lookupError.code);
    redirect("/admin/releases?error=save");
  }
  if (!current) redirect("/admin/releases?error=not-found");

  let uploaded: Awaited<ReturnType<typeof uploadReleaseCoverObject>>;

  try {
    uploaded = await uploadReleaseCoverObject(current.id, normalizedImage);
  } catch {
    console.error("Release cover storage upload failed");
    redirect("/admin/releases?error=save");
  }

  const updateQuery = supabase
    .from("music_releases")
    .update({
      cover_image_url: uploaded.publicUrl,
      cover_image_path: uploaded.path
    })
    .eq("id", releaseId);
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
      redirect("/admin/releases?error=save");
    }
    redirect("/admin/releases?error=cover-conflict");
  }

  if (current.cover_image_path && current.cover_image_path !== uploaded.path) {
    await discardReleaseCover(current.cover_image_path, "Previous release cover cleanup failed");
  }

  revalidateReleaseAdmin();
  redirect("/admin/releases?notice=cover-saved");
}

async function removeMusicReleaseCover(formData: FormData) {
  "use server";

  if (!(await isAdminAuthenticated())) redirect("/admin/releases?error=auth");

  const releaseId = stringValue(formData.get("releaseId")).toLowerCase();

  if (!UUID_PATTERN.test(releaseId)) {
    redirect("/admin/releases?error=invalid");
  }

  const supabase = getSupabaseAdmin();
  const { data: current, error: lookupError } = await supabase
    .from("music_releases")
    .select("id, youtube_video_id, cover_image_path, updated_at")
    .eq("id", releaseId)
    .maybeSingle();

  if (lookupError) {
    console.error("Release cover lookup failed:", lookupError.code);
    redirect("/admin/releases?error=save");
  }
  if (!current) redirect("/admin/releases?error=not-found");
  if (!current.cover_image_path) redirect("/admin/releases?error=cover-conflict");

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
    .eq("cover_image_path", current.cover_image_path)
    .eq("updated_at", current.updated_at)
    .select("id")
    .maybeSingle();

  if (updateError) {
    console.error("Release cover removal update failed:", updateError.code);
    redirect("/admin/releases?error=save");
  }
  if (!updated) redirect("/admin/releases?error=cover-conflict");

  await discardReleaseCover(current.cover_image_path, "Removed release cover cleanup failed");
  revalidateReleaseAdmin();
  redirect("/admin/releases?notice=cover-removed");
}

async function updateRoleConfiguration(formData: FormData) {
  "use server";

  if (!(await isAdminAuthenticated())) redirect("/admin/releases?error=auth");

  const roleId = stringValue(formData.get("roleId"));
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
    redirect("/admin/releases?error=invalid");
  }

  if (
    !UUID_PATTERN.test(roleId) ||
    !EDITABLE_ROLE_STATES.includes(state as never) ||
    !Number.isSafeInteger(capacity) ||
    capacity < 1 ||
    capacity > 100
  ) {
    redirect("/admin/releases?error=invalid");
  }

  const supabase = getSupabaseAdmin();
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
    redirect("/admin/releases?error=save");
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
    redirect(`/admin/releases?error=${reason}`);
  }

  revalidateReleaseAdmin();
  redirect("/admin/releases?notice=role-saved");
}

async function addReleaseRole(formData: FormData) {
  "use server";

  if (!(await isAdminAuthenticated())) redirect("/admin/releases?error=auth");

  const releaseId = stringValue(formData.get("releaseId"));
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
    redirect("/admin/releases?error=invalid");
  }

  if (
    !UUID_PATTERN.test(releaseId) ||
    !/^[a-z][a-z0-9_]{1,39}$/.test(roleTypeCode) ||
    !EDITABLE_ROLE_STATES.includes(state as never)
  ) {
    redirect("/admin/releases?error=invalid");
  }

  const supabase = getSupabaseAdmin();
  const { data: roleType, error: roleTypeError } = await supabase
    .from("release_role_types")
    .select("code, sort_order")
    .eq("code", roleTypeCode)
    .eq("is_active", true)
    .maybeSingle();

  if (roleTypeError) {
    console.error("Release role type lookup failed:", roleTypeError.message);
    redirect("/admin/releases?error=save");
  }
  if (!roleType) redirect("/admin/releases?error=invalid");

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
    redirect(`/admin/releases?error=${reason}`);
  }

  revalidateReleaseAdmin();
  redirect("/admin/releases?notice=role-added");
}

export default async function AdminReleasesPage({
  searchParams
}: {
  searchParams: SearchParams;
}) {
  if (!(await isAdminAuthenticated())) redirect("/admin");

  try {
    await processReleaseCoverCleanupQueue(5);
  } catch (cleanupError) {
    console.error("Release cover cleanup queue processing failed:", cleanupError);
  }

  const { notice, error } = await searchParams;
  const message = noticeMessage(notice, error);
  const { releases, roleTypes, roles, credits, applications } =
    await loadReleaseManagementData();
  const roleTypeByCode = new Map(roleTypes.map((item) => [item.code, item]));

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <p className="admin-eyebrow">PROJECTS / PARTICIPATION LEADS</p>
          <h1>프로젝트 · 파트 관리</h1>
        </div>
        <div className="admin-actions">
          <Link href="/admin">운영 관리</Link>
          <Link href="/admin/release-applications">참여 신청</Link>
          <form action="/api/admin/logout" method="post">
            <button type="submit">로그아웃</button>
          </form>
        </div>
      </header>

      <div className="admin-management-page">
        {message ? (
          <div className="admin-alert" role={error ? "alert" : "status"} aria-live={error ? "assertive" : "polite"}>
            {message}
          </div>
        ) : null}

        <section className="admin-management-section" aria-labelledby="add-release-title">
          <div className="admin-table-heading">
            <div>
              <p className="admin-eyebrow">NEW PROJECT ITEM</p>
              <h2 id="add-release-title">새 UP NEXT 추가</h2>
            </div>
          </div>

          <form className="admin-add-role-form admin-add-release-form" action={addMusicRelease}>
            <label className="admin-form-field">
              <span>프로젝트</span>
              <select name="projectSlug" defaultValue="vintagechord-post-production" required>
                {PROJECTS.map((project) => (
                  <option value={project.slug} key={project.slug}>{project.label}</option>
                ))}
              </select>
            </label>
            <label className="admin-form-field">
              <span>번호</span>
              <input name="releaseNumber" type="number" min="1" max="999" required />
            </label>
            <label className="admin-form-field">
              <span>상태</span>
              <select name="state" defaultValue="upcoming" required>
                <option value="upcoming">공개 예정</option>
                <option value="released">발매됨</option>
                <option value="draft">초안</option>
                <option value="archived">보관됨</option>
              </select>
            </label>
            <label className="admin-form-field">
              <span>공개일</span>
              <input name="releaseDate" type="date" />
            </label>
            <label className="admin-form-field is-wide">
              <span>제목</span>
              <input name="title" type="text" maxLength={160} required />
            </label>
            <label className="admin-form-field is-wide">
              <span>아티스트</span>
              <input name="artistName" type="text" maxLength={200} placeholder="빈티지코드 / SunizShine" required />
            </label>
            <label className="admin-form-field is-wide">
              <span>YouTube 영상 ID</span>
              <input name="youtubeVideoId" type="text" maxLength={11} placeholder="rW3Nln-nYQ8" />
            </label>
            <label className="admin-form-field is-wide">
              <span>짧은 표기</span>
              <input name="summary" type="text" maxLength={1000} placeholder="Prod. / 메모" />
            </label>
            <label className="admin-check-field">
              <input name="isPublished" type="checkbox" />
              <span>사이트에 공개</span>
            </label>
            <button className="admin-form-button" type="submit">항목 추가</button>
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

                return (
                  <article className="admin-release-card" key={release.id}>
                    <header>
                      <div className="admin-release-title">
                        <p>
                          {projectLabel(release.project_slug)} · {String(release.release_number).padStart(2, "0")} · {release.artist_name}
                        </p>
                        <h3>{release.title}</h3>
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

                    <AdminReleaseCoverManager
                      releaseId={release.id}
                      releaseNumber={release.release_number}
                      releaseTitle={release.title}
                      currentImageUrl={release.cover_image_url}
                      hasManagedCover={Boolean(release.cover_image_path)}
                      maxFileSizeMb={Math.round(MAX_RELEASE_COVER_FILE_BYTES / 1024 / 1024)}
                      uploadAction={uploadMusicReleaseCover}
                      removeAction={removeMusicReleaseCover}
                    />

                    <details className="admin-release-edit">
                      <summary>항목 정보 수정</summary>
                      <form className="admin-add-role-form" action={updateMusicRelease}>
                        <input type="hidden" name="releaseId" value={release.id} />
                        <label className="admin-form-field">
                          <span>상태</span>
                          <select name="state" defaultValue={release.state} required>
                            <option value="upcoming">공개 예정</option>
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
                      <div className="admin-empty">아직 등록된 참여 파트가 없습니다.</div>
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
                                <summary>파트 설정</summary>
                                <form className="admin-add-role-form" action={updateRoleConfiguration}>
                                  <input type="hidden" name="roleId" value={role.id} />
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
                      <form className="admin-add-role-form" action={addReleaseRole}>
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
