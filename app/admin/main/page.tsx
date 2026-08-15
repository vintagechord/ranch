import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { getOpenChatSettings, normalizeOpenChatUrl, setOpenChatUrl } from "@/lib/openChat";
import { addPiggyBankAmount, getPiggyBankBalance } from "@/lib/piggyBank";
import { getNextMeetingSetting } from "@/lib/projectSiteSettings.server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ piggy?: string; chat?: string; meeting?: string }>;

function formatDateOnly(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeZone: "Asia/Seoul"
  }).format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) return "일정 미설정";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "long",
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0
  }).format(value);
}

function safeOpenChatHref(value: string | null) {
  if (!value) return null;

  try {
    return normalizeOpenChatUrl(value);
  } catch {
    return null;
  }
}

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parsePositiveAmount(value: FormDataEntryValue | null) {
  const amount = Number(stringValue(value).replaceAll(",", ""));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : 0;
}

function piggyMessage(status?: string) {
  if (status === "saved") return "저금통 금액을 추가했습니다.";
  if (status === "invalid") return "추가할 금액을 1원 이상 정수로 입력해 주세요.";
  if (status === "auth") return "관리자 확인이 필요합니다.";
  if (status === "error") return "저금통 금액을 저장하지 못했습니다.";
  return "";
}

function chatMessage(status?: string) {
  if (status === "saved") return "오픈채팅방 링크를 저장했습니다.";
  if (status === "invalid") return "올바른 오픈채팅방 링크를 입력해 주세요.";
  if (status === "auth") return "관리자 확인이 필요합니다.";
  if (status === "error") return "오픈채팅방 링크를 저장하지 못했습니다.";
  return "";
}

function meetingMessage(status?: string) {
  if (status === "saved") return "다음 모임 일정을 메인에 반영했습니다.";
  if (status === "conflict") return "다른 변경이 먼저 저장되었습니다. 최신 내용을 확인해 주세요.";
  if (status === "invalid") return "모임 날짜, 시간, 장소를 확인해 주세요.";
  if (status === "auth") return "관리자 확인이 필요합니다.";
  if (status === "error") return "다음 모임 일정을 저장하지 못했습니다.";
  return "";
}

async function savePiggyBankAmount(formData: FormData) {
  "use server";
  if (!(await isAdminAuthenticated())) redirect("/admin/main?piggy=auth");

  const amount = parsePositiveAmount(formData.get("amount"));
  if (!amount) redirect("/admin/main?piggy=invalid#piggy-bank");

  try {
    await addPiggyBankAmount(amount);
  } catch (error) {
    console.error("Piggy bank update failed:", error instanceof Error ? error.message : error);
    redirect("/admin/main?piggy=error#piggy-bank");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/main");
  revalidatePath("/");
  redirect("/admin/main?piggy=saved#piggy-bank");
}

async function saveOpenChatUrl(formData: FormData) {
  "use server";
  if (!(await isAdminAuthenticated())) redirect("/admin/main?chat=auth");

  const chatUrl = stringValue(formData.get("chatUrl"));
  try {
    normalizeOpenChatUrl(chatUrl);
  } catch {
    redirect("/admin/main?chat=invalid#open-chat");
  }

  try {
    await setOpenChatUrl(chatUrl);
  } catch (error) {
    console.error("Open chat link update failed:", error instanceof Error ? error.message : error);
    redirect("/admin/main?chat=error#open-chat");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/main");
  revalidatePath("/");
  redirect("/admin/main?chat=saved#open-chat");
}

async function saveNextMeeting(formData: FormData) {
  "use server";
  if (!(await isAdminAuthenticated())) redirect("/admin/main?meeting=auth");

  const expectedUpdatedAt = stringValue(formData.get("expectedUpdatedAt"));
  const localDateTime = stringValue(formData.get("nextMeetingAt"));
  const venue = stringValue(formData.get("venue"));
  const isVisible = formData.get("isVisible") === "on";

  if (
    !expectedUpdatedAt ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localDateTime) ||
    venue.length < 1 ||
    venue.length > 100
  ) {
    redirect("/admin/main?meeting=invalid#next-meeting");
  }

  const parsed = new Date(`${localDateTime}:00+09:00`);
  if (Number.isNaN(parsed.getTime())) redirect("/admin/main?meeting=invalid#next-meeting");

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("admin_update_next_meeting_setting", {
    p_expected_updated_at: expectedUpdatedAt,
    p_next_meeting_at: parsed.toISOString(),
    p_venue: venue,
    p_is_visible: isVisible
  });

  if (error) {
    console.error("Next meeting update failed:", error.code);
    redirect("/admin/main?meeting=error#next-meeting");
  }

  if (data?.status !== "updated") {
    redirect(`/admin/main?meeting=${data?.status === "conflict" ? "conflict" : "invalid"}#next-meeting`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/main");
  revalidatePath("/");
  redirect("/admin/main?meeting=saved#next-meeting");
}

export default async function AdminMainOperationsPage({
  searchParams
}: {
  searchParams: SearchParams;
}) {
  if (!(await isAdminAuthenticated())) redirect("/admin");

  const params = await searchParams;
  const [piggyBankResult, openChatResult, nextMeetingResult] = await Promise.allSettled([
    getPiggyBankBalance(),
    getOpenChatSettings(),
    getNextMeetingSetting()
  ]);
  const piggyBank = piggyBankResult.status === "fulfilled" ? piggyBankResult.value : null;
  const openChat = openChatResult.status === "fulfilled" ? openChatResult.value : null;
  const nextMeeting = nextMeetingResult.status === "fulfilled" ? nextMeetingResult.value : null;
  const openChatHref = safeOpenChatHref(openChat?.chatUrl ?? null);

  if (piggyBankResult.status === "rejected") {
    console.error(
      "Piggy bank settings load failed:",
      piggyBankResult.reason instanceof Error ? piggyBankResult.reason.message : piggyBankResult.reason
    );
  }
  if (openChatResult.status === "rejected") {
    console.error(
      "Open chat settings load failed:",
      openChatResult.reason instanceof Error ? openChatResult.reason.message : openChatResult.reason
    );
  }
  if (nextMeetingResult.status === "rejected") {
    console.error(
      "Next meeting settings load failed:",
      nextMeetingResult.reason instanceof Error ? nextMeetingResult.reason.message : nextMeetingResult.reason
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-topbar admin-page-heading">
        <div>
          <p className="admin-eyebrow">MAIN / ALWAYS ON</p>
          <h1>메인 운영</h1>
          <p>프로젝트가 바뀌어도 계속 유지되는 사이트 정보만 모았습니다.</p>
        </div>
      </header>

      <div className="admin-main-operations">
        <section id="next-meeting" className="admin-operation-card is-meeting" aria-labelledby="next-meeting-title">
          <div className="admin-operation-copy">
            <p className="admin-eyebrow">NEXT SESSION</p>
            <h2 id="next-meeting-title">다음 모임</h2>
            <strong>{nextMeeting ? formatDateTime(nextMeeting.nextMeetingAt) : "-"}</strong>
            <span>{nextMeeting?.venue ?? "일정 정보 없음"}</span>
            <small>{nextMeeting ? (nextMeeting.isVisible ? "메인 파형 모니터에 표시 중" : "메인에서 숨김") : "새로고침 후 다시 확인해 주세요."}</small>
          </div>
          {nextMeeting ? (
            <form className="admin-operation-form" action={saveNextMeeting}>
              <input type="hidden" name="expectedUpdatedAt" value={nextMeeting.updatedAt} />
              <label><span>날짜와 시간 (KST)</span><input name="nextMeetingAt" type="datetime-local" defaultValue={formatDateTimeInput(nextMeeting.nextMeetingAt)} required /></label>
              <label><span>장소</span><input name="venue" type="text" maxLength={100} defaultValue={nextMeeting.venue} required /></label>
              <label className="admin-check-field"><input name="isVisible" type="checkbox" defaultChecked={nextMeeting.isVisible} /><span>메인에 일정 표시</span></label>
              <button type="submit">일정 저장</button>
            </form>
          ) : (
            <div className="admin-alert" role="alert">다음 모임 정보를 불러오지 못했습니다. 다른 메인 운영 기능은 계속 사용할 수 있습니다.</div>
          )}
        </section>
        {meetingMessage(params.meeting) ? <div className="admin-alert" role={params.meeting === "saved" ? "status" : "alert"}>{meetingMessage(params.meeting)}</div> : null}

        <section id="piggy-bank" className="admin-operation-card" aria-labelledby="piggy-bank-title">
          <div className="admin-operation-copy">
            <p className="admin-eyebrow">PIGGY BANK</p>
            <h2 id="piggy-bank-title">저금통</h2>
            <strong>{piggyBank ? formatCurrency(piggyBank.balanceAmount) : "-"}</strong>
            <small>{piggyBank ? `최근 업데이트 ${formatDateOnly(piggyBank.updatedAt)}` : "금액 정보 없음"}</small>
          </div>
          {piggyBank ? (
            <form className="admin-operation-form" action={savePiggyBankAmount}>
              <label><span>추가 금액</span><input name="amount" type="number" min="1" step="1" inputMode="numeric" placeholder="예: 100000" required /></label>
              <button type="submit">금액 추가</button>
            </form>
          ) : (
            <div className="admin-alert" role="alert">저금통 정보를 불러오지 못했습니다. 확인 전에는 금액을 추가할 수 없습니다.</div>
          )}
        </section>
        {piggyMessage(params.piggy) ? <div className="admin-alert" role={params.piggy === "saved" ? "status" : "alert"}>{piggyMessage(params.piggy)}</div> : null}

        <section id="open-chat" className="admin-operation-card" aria-labelledby="open-chat-title">
          <div className="admin-operation-copy">
            <p className="admin-eyebrow">OPEN CHAT</p>
            <h2 id="open-chat-title">오픈채팅</h2>
            <strong className="is-url">
              {openChatHref ? (
                <a href={openChatHref} target="_blank" rel="noopener noreferrer">
                  {openChat?.chatUrl}
                  <span className="sr-only"> (새 창)</span>
                </a>
              ) : (openChat?.chatUrl ?? "링크 미설정")}
            </strong>
            <small>{openChat ? `최근 업데이트 ${formatDateOnly(openChat.updatedAt)}` : "링크 정보 없음"}</small>
          </div>
          {openChat ? (
            <form className="admin-operation-form" action={saveOpenChatUrl}>
              <label><span>오픈채팅방 링크</span><input name="chatUrl" type="url" inputMode="url" defaultValue={openChat.chatUrl ?? ""} placeholder="https://open.kakao.com/o/..." required /></label>
              <button type="submit">링크 저장</button>
            </form>
          ) : (
            <div className="admin-alert" role="alert">오픈채팅 정보를 불러오지 못했습니다. 확인 전에는 링크를 변경할 수 없습니다.</div>
          )}
        </section>
        {chatMessage(params.chat) ? <div className="admin-alert" role={params.chat === "saved" ? "status" : "alert"}>{chatMessage(params.chat)}</div> : null}
      </div>
    </main>
  );
}
