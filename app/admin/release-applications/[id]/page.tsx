import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { getProjectBySlug } from "@/lib/projects";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const APPLICATION_STATUSES = [
  "new",
  "reviewing",
  "contacted",
  "shortlisted",
  "accepted",
  "declined",
  "withdrawn"
] as const;

type SearchParams = Promise<{
  notice?: string;
  error?: string;
}>;

type ApplicationDetail = {
  id: string;
  release_role_id: string;
  applicant_name: string;
  credit_name: string;
  email: string;
  phone: string | null;
  profile_url: string | null;
  portfolio_url: string | null;
  availability: string;
  message: string;
  status: string;
  admin_note: string | null;
  status_changed_at: string;
  privacy_agreed: boolean;
  consented_at: string;
  privacy_notice_version: string;
  credit_publication_agreed: boolean;
  credit_publication_consented_at: string;
  credit_publication_notice_version: string;
  retention_until: string;
  created_at: string;
  updated_at: string;
};

type ReleaseRoleDetail = {
  id: string;
  release_id: string;
  role_type_code: string;
  state: string;
};

type ReleaseDetail = {
  id: string;
  project_slug: string;
  release_number: number;
  title: string;
  artist_name: string;
  release_date: string | null;
};

function projectLabel(slug: string) {
  return getProjectBySlug(slug)?.shortTitle ?? slug;
}

type RoleTypeDetail = {
  code: string;
  label_ko: string;
};

type StatusEvent = {
  id: number;
  from_status: string | null;
  to_status: string;
  note: string | null;
  created_at: string;
};

type ApplicationCredit = {
  display_name: string;
  is_ranch_member: boolean;
  participant_slot: number | null;
};

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul"
  }).format(new Date(value));
}

function formatDateOnly(value: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeZone: "Asia/Seoul"
  }).format(new Date(value));
}

function statusLabel(status: string | null) {
  if (!status) return "접수";
  if (status === "new") return "새 신청";
  if (status === "reviewing") return "검토 중";
  if (status === "contacted") return "연락 완료";
  if (status === "shortlisted") return "후보";
  if (status === "accepted") return "참여 확정";
  if (status === "declined") return "미선정";
  if (status === "withdrawn") return "철회";
  return status;
}

function feedbackMessage(notice?: string, error?: string) {
  if (notice === "updated") return "신청 상태와 검토 기록을 저장했습니다.";
  if (error === "auth") return "관리자 확인이 필요합니다. 다시 로그인해 주세요.";
  if (error === "invalid") return "상태와 크레딧 정보를 확인해 주세요.";
  if (error === "not-found") return "신청을 찾을 수 없거나 보관 기간이 만료되었습니다.";
  if (error === "expired") return "보관 기간이 만료되어 처리할 수 없습니다.";
  if (error === "capacity") return "이미 파트 정원이 모두 확정되었습니다.";
  if (error === "role") return "현재 모집 가능한 파트가 아니어서 확정할 수 없습니다.";
  if (error === "save") return "심사 결과를 저장하지 못했습니다.";
  return "";
}

async function loadApplication(id: string) {
  if (!UUID_PATTERN.test(id)) return null;

  const supabase = getSupabaseAdmin();
  const { error: purgeError } = await supabase.rpc(
    "purge_expired_release_participation_applications",
    {}
  );
  if (purgeError) throw new Error(purgeError.message);

  const { data: application, error: applicationError } = await supabase
    .from("release_participation_applications")
    .select(
      "id, release_role_id, applicant_name, credit_name, email, phone, profile_url, portfolio_url, availability, message, status, admin_note, status_changed_at, privacy_agreed, consented_at, privacy_notice_version, credit_publication_agreed, credit_publication_consented_at, credit_publication_notice_version, retention_until, created_at, updated_at"
    )
    .eq("id", id)
    .gt("retention_until", new Date().toISOString())
    .maybeSingle();

  if (applicationError) throw new Error(applicationError.message);
  if (!application) return null;

  const typedApplication = application as ApplicationDetail;
  const [{ data: role, error: roleError }, { data: events, error: eventError }, { data: credit, error: creditError }] =
    await Promise.all([
      supabase
        .from("release_roles")
        .select("id, release_id, role_type_code, state")
        .eq("id", typedApplication.release_role_id)
        .maybeSingle(),
      supabase
        .from("release_application_status_events")
        .select("id, from_status, to_status, note, created_at")
        .eq("application_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("release_credits")
        .select("display_name, is_ranch_member, participant_slot")
        .eq("source_application_id", id)
        .maybeSingle()
    ]);

  const firstError = [roleError, eventError, creditError].find(Boolean);
  if (firstError) throw new Error(firstError.message);
  if (!role) return null;

  const typedRole = role as ReleaseRoleDetail;
  const [{ data: release, error: releaseError }, { data: roleType, error: roleTypeError }] =
    await Promise.all([
      supabase
        .from("music_releases")
        .select("id, project_slug, release_number, title, artist_name, release_date")
        .eq("id", typedRole.release_id)
        .maybeSingle(),
      supabase
        .from("release_role_types")
        .select("code, label_ko")
        .eq("code", typedRole.role_type_code)
        .maybeSingle()
    ]);

  const secondError = [releaseError, roleTypeError].find(Boolean);
  if (secondError) throw new Error(secondError.message);
  if (!release || !roleType) return null;

  return {
    application: typedApplication,
    role: typedRole,
    release: release as ReleaseDetail,
    roleType: roleType as RoleTypeDetail,
    events: (events ?? []) as StatusEvent[],
    credit: (credit as ApplicationCredit | null) ?? null
  };
}

async function reviewApplication(formData: FormData) {
  "use server";

  const applicationId = stringValue(formData.get("applicationId"));
  if (!(await isAdminAuthenticated())) {
    redirect(`/admin/release-applications/${applicationId}?error=auth`);
  }

  const status = stringValue(formData.get("status"));
  const adminNote = stringValue(formData.get("adminNote"));
  const creditDisplayName = stringValue(formData.get("creditDisplayName"));
  const creditIsRanchMember = formData.get("creditIsRanchMember") === "on";
  const participantSlotValue = stringValue(formData.get("creditParticipantSlot"));
  const participantSlot = participantSlotValue ? Number(participantSlotValue) : null;

  if (
    !UUID_PATTERN.test(applicationId) ||
    !APPLICATION_STATUSES.includes(status as never) ||
    adminNote.length > 4000 ||
    creditDisplayName.length > 80 ||
    (status === "accepted" && !creditDisplayName) ||
    (participantSlot !== null &&
      (!Number.isSafeInteger(participantSlot) || participantSlot < 1 || participantSlot > 16))
  ) {
    redirect(`/admin/release-applications/${applicationId}?error=invalid`);
  }

  const existingApplication = await loadApplication(applicationId);
  if (!existingApplication) {
    redirect(`/admin/release-applications/${applicationId}?error=not-found`);
  }
  const projectSlug = existingApplication.release.project_slug;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("review_release_participation_application", {
    p_application_id: applicationId,
    p_status: status,
    p_admin_note: adminNote || null,
    p_credit_display_name: creditDisplayName || null,
    p_credit_is_ranch_member: creditIsRanchMember,
    p_credit_participant_slot: participantSlot
  });

  if (error) {
    console.error("Release participation review failed:", error.message);
    redirect(`/admin/release-applications/${applicationId}?error=save`);
  }

  if (data !== "updated") {
    const reason =
      data === "expired"
        ? "expired"
        : data === "not_found"
          ? "not-found"
          : data === "capacity_reached"
            ? "capacity"
            : data === "role_not_open"
              ? "role"
              : "invalid";
    redirect(`/admin/release-applications/${applicationId}?error=${reason}`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/releases");
  revalidatePath(`/admin/projects/${projectSlug}`);
  revalidatePath("/admin/release-applications");
  revalidatePath(`/admin/release-applications/${applicationId}`);
  revalidatePath(`/projects/${projectSlug}`);
  redirect(`/admin/release-applications/${applicationId}?notice=updated`);
}

export default async function AdminReleaseApplicationDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  if (!(await isAdminAuthenticated())) redirect("/admin");

  const [{ id }, query] = await Promise.all([params, searchParams]);
  const result = await loadApplication(id);
  if (!result) notFound();

  const { application, role, release, roleType, events, credit } = result;
  const message = feedbackMessage(query.notice, query.error);
  const currentCreditName = credit?.display_name ?? application.credit_name;
  const currentIsRanchMember = credit?.is_ranch_member ?? false;
  const currentParticipantSlot = credit?.participant_slot ?? null;

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <p className="admin-eyebrow">PROJECT APPLICATION / DETAIL</p>
          <h1>참여 신청 확인</h1>
        </div>
        <div className="admin-actions">
          <Link href={`/admin/release-applications?project=${release.project_slug}`}>프로젝트 신청 목록</Link>
          <Link href={`/admin/projects/${release.project_slug}`}>프로젝트 관리</Link>
        </div>
      </header>

      {message ? <div className="admin-alert" style={{ marginTop: 28 }}>{message}</div> : null}

      <article className="admin-proposal-detail-page">
        <header>
          <div>
            <p>{release.artist_name} · {roleType.label_ko}</p>
            <h2>{application.applicant_name}</h2>
          </div>
          <span className="admin-status-badge" data-status={application.status}>
            {statusLabel(application.status)}
          </span>
        </header>

        <div className="admin-release-meta" aria-label="신청 대상">
          <span>{projectLabel(release.project_slug)} · {String(release.release_number).padStart(2, "0")}</span>
          <span>{release.title}</span>
          <span>{roleType.label_ko}</span>
          <span>파트 상태 {role.state}</span>
          <span>공개일 {formatDateOnly(release.release_date)}</span>
        </div>

        <dl className="admin-proposal-detail-meta">
          <div>
            <dt>접수 일시</dt>
            <dd>{formatDate(application.created_at)}</dd>
          </div>
          <div>
            <dt>신청자</dt>
            <dd>{application.applicant_name}</dd>
          </div>
          <div>
            <dt>희망 크레딧</dt>
            <dd>{application.credit_name}</dd>
          </div>
          <div>
            <dt>이메일</dt>
            <dd><a href={`mailto:${application.email}`}>{application.email}</a></dd>
          </div>
          <div>
            <dt>연락처</dt>
            <dd>{application.phone ? <a href={`tel:${application.phone}`}>{application.phone}</a> : "-"}</dd>
          </div>
          <div>
            <dt>프로필</dt>
            <dd>
              {application.profile_url ? (
                <a href={application.profile_url} target="_blank" rel="noopener noreferrer">프로필 열기 ↗</a>
              ) : "-"}
            </dd>
          </div>
          <div>
            <dt>포트폴리오</dt>
            <dd>
              {application.portfolio_url ? (
                <a href={application.portfolio_url} target="_blank" rel="noopener noreferrer">자료 열기 ↗</a>
              ) : "-"}
            </dd>
          </div>
          <div>
            <dt>개인정보 동의</dt>
            <dd>
              {application.privacy_agreed ? "동의" : "미동의"} · {formatDate(application.consented_at)} · {application.privacy_notice_version}
            </dd>
          </div>
          <div>
            <dt>공개 크레딧 동의</dt>
            <dd>
              {application.credit_publication_agreed ? "동의" : "미동의"} · {formatDate(application.credit_publication_consented_at)} · {application.credit_publication_notice_version}
            </dd>
          </div>
          <div>
            <dt>보관 만료</dt>
            <dd>{formatDate(application.retention_until)}</dd>
          </div>
        </dl>

        <div className="admin-detail-columns">
          <div className="admin-detail-panel">
            <h2>참여 제안</h2>
            <p className="admin-detail-message">{application.message}</p>
          </div>
          <div className="admin-detail-panel">
            <h2>가능 일정</h2>
            <p className="admin-detail-message">{application.availability}</p>
          </div>
        </div>

        <div className="admin-detail-columns">
          <section className="admin-detail-panel" aria-labelledby="review-title">
            <h2 id="review-title">심사 처리</h2>
            <p className="admin-review-note">
              참여 확정으로 저장하면 공개 크레딧이 생성되고 해당 파트가 참여 확정 상태로 바뀝니다.
            </p>
            <form className="admin-review-form" action={reviewApplication}>
              <input type="hidden" name="applicationId" value={application.id} />
              <label className="admin-form-field">
                <span>상태</span>
                <select name="status" defaultValue={application.status} required>
                  {APPLICATION_STATUSES.map((status) => (
                    <option value={status} key={status}>{statusLabel(status)}</option>
                  ))}
                </select>
              </label>
              <label className="admin-form-field">
                <span>확정 크레딧 이름</span>
                <input
                  name="creditDisplayName"
                  type="text"
                  maxLength={80}
                  defaultValue={currentCreditName}
                  required
                />
              </label>
              <label className="admin-form-field">
                <span>목장 멤버 슬롯</span>
                <select
                  name="creditParticipantSlot"
                  defaultValue={currentParticipantSlot ? String(currentParticipantSlot) : ""}
                >
                  <option value="">해당 없음</option>
                  {Array.from({ length: 16 }, (_, index) => index + 1).map((slot) => (
                    <option value={slot} key={slot}>참가자 {slot}</option>
                  ))}
                </select>
              </label>
              <label className="admin-form-field is-wide">
                <span>관리자 메모</span>
                <textarea name="adminNote" maxLength={4000} defaultValue={application.admin_note ?? ""} />
              </label>
              <label className="admin-check-field">
                <input
                  name="creditIsRanchMember"
                  type="checkbox"
                  defaultChecked={currentIsRanchMember}
                />
                <span>참여 확정 시 목장 멤버로 표기</span>
              </label>
              <button className="admin-form-button" type="submit">심사 결과 저장</button>
            </form>
          </section>

          <aside className="admin-detail-panel" aria-labelledby="history-title">
            <h2 id="history-title">상태 기록</h2>
            {events.length === 0 ? (
              <div className="admin-empty">아직 상태 변경 기록이 없습니다.</div>
            ) : (
              <ol className="admin-history-list">
                {events.map((event) => (
                  <li key={event.id}>
                    <time dateTime={event.created_at}>{formatDate(event.created_at)}</time>
                    <strong>
                      {statusLabel(event.from_status)} → {statusLabel(event.to_status)}
                    </strong>
                    {event.note ? <p>{event.note}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </aside>
        </div>
      </article>
    </main>
  );
}
