import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/adminAuth";
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
const EDITABLE_ROLE_STATES = ["open", "paused", "closed"] as const;
const PUBLIC_PROJECT_PATH = "/projects/vintagechord-post-production";

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

function releaseStateLabel(state: string) {
  if (state === "released") return "발매됨";
  if (state === "upcoming") return "공개 예정";
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
  if (notice === "state-saved") return "참여 파트 상태를 저장했습니다.";
  if (notice === "role-added") return "새 참여 파트를 추가했습니다.";
  if (error === "auth") return "관리자 확인이 필요합니다. 다시 로그인해 주세요.";
  if (error === "invalid") return "입력한 참여 파트 정보를 확인해 주세요.";
  if (error === "duplicate") return "이미 이 음원에 등록된 참여 파트입니다.";
  if (error === "capacity") return "정원이 모두 확정된 파트는 다시 모집할 수 없습니다.";
  if (error === "not-found") return "대상을 찾을 수 없습니다.";
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
          "id, project_slug, release_number, title, artist_name, release_date, state, youtube_video_id, cover_image_url, is_published"
        )
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
  revalidatePath(PUBLIC_PROJECT_PATH);
}

async function updateRoleState(formData: FormData) {
  "use server";

  if (!(await isAdminAuthenticated())) redirect("/admin/releases?error=auth");

  const roleId = stringValue(formData.get("roleId"));
  const state = stringValue(formData.get("state"));
  if (!UUID_PATTERN.test(roleId) || !EDITABLE_ROLE_STATES.includes(state as never)) {
    redirect("/admin/releases?error=invalid");
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("set_release_role_state", {
    p_role_id: roleId,
    p_state: state
  });

  if (error) {
    console.error("Release role state update failed:", error.message);
    redirect("/admin/releases?error=save");
  }
  if (data !== "updated") {
    const reason = data === "capacity_reached"
      ? "capacity"
      : data === "not_found"
        ? "not-found"
        : "invalid";
    redirect(`/admin/releases?error=${reason}`);
  }

  revalidateReleaseAdmin();
  redirect("/admin/releases?notice=state-saved");
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

  const { notice, error } = await searchParams;
  const message = noticeMessage(notice, error);
  const { releases, roleTypes, roles, credits, applications } =
    await loadReleaseManagementData();
  const roleTypeByCode = new Map(roleTypes.map((item) => [item.code, item]));

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <p className="admin-eyebrow">RELEASES / PARTICIPATION LEADS</p>
          <h1>발매 · 파트 관리</h1>
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
        {message ? <div className="admin-alert">{message}</div> : null}

        <section className="admin-management-section" aria-labelledby="release-list-title">
          <div className="admin-table-heading">
            <div>
              <p className="admin-eyebrow">VINTAGECHORD RELEASES</p>
              <h2 id="release-list-title">음원과 참여 파트</h2>
            </div>
            <span>음원 {releases.length}개</span>
          </div>

          {releases.length === 0 ? (
            <div className="admin-empty">등록된 음원이 없습니다.</div>
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
                          RELEASE {String(release.release_number).padStart(2, "0")} · {release.artist_name}
                        </p>
                        <h3>{release.title}</h3>
                      </div>
                      <div className="admin-release-meta" aria-label="음원 상태">
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
                                    data-status={role.state}
                                  >
                                    {roleStateLabel(role.state)}
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
                                <form className="admin-inline-form" action={updateRoleState}>
                                  <input type="hidden" name="roleId" value={role.id} />
                                  <label className="admin-form-field">
                                    <span className="sr-only">{roleType?.label_ko ?? role.role_type_code} 상태</span>
                                    <select name="state" defaultValue={role.state} required>
                                      {role.state === "filled" ? (
                                        <option value="filled" disabled>참여 확정</option>
                                      ) : null}
                                      <option value="open">모집 중</option>
                                      <option value="paused">일시 중지</option>
                                      <option value="closed">마감</option>
                                    </select>
                                  </label>
                                  <button className="admin-form-button" type="submit">
                                    저장
                                  </button>
                                </form>
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
