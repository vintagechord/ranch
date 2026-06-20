import { NextResponse } from "next/server";
import { getOpenChatSettings } from "@/lib/openChat";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type ApplyPayload = {
  name?: unknown;
  phone?: unknown;
  auction_item?: unknown;
  advance_team?: unknown;
  creative_project?: unknown;
  food_note?: unknown;
  memo?: unknown;
  privacy_agreed?: unknown;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function choiceValue(value: unknown) {
  const choice = stringValue(value);
  return choice === "네" || choice === "아니오" || choice === "모르겠음" ? choice : "";
}

export async function POST(request: Request) {
  let body: ApplyPayload;

  try {
    body = (await request.json()) as ApplyPayload;
  } catch {
    return jsonError("요청 형식이 올바르지 않습니다.", 400);
  }

  const name = stringValue(body.name);
  const phone = stringValue(body.phone);
  const auctionItem = choiceValue(body.auction_item);

  if (!name) {
    return jsonError("이름을 입력해 주세요.", 400);
  }

  if (!phone) {
    return jsonError("연락처를 입력해 주세요.", 400);
  }

  if (!auctionItem) {
    return jsonError("경매 물품 여부를 선택해 주세요.", 400);
  }

  if (body.privacy_agreed !== true) {
    return jsonError("개인정보 수집 동의가 필요합니다.", 400);
  }

  let supabase;

  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    console.error(
      "Application storage configuration failed:",
      error instanceof Error ? error.message : error
    );
    return jsonError("신청 접수 설정에 문제가 있습니다. 준비팀에 알려주세요.", 500);
  }

  // TODO: 같은 연락처 중복 신청 방지 정책이 필요해지면 phone 기준 조회 후 처리한다.
  const { error } = await supabase.from("party_applications").insert({
    name,
    phone,
    people_count: 1,
    depositor_name: name,
    companions: null,
    auction_item: auctionItem,
    advance_team: body.advance_team === true,
    creative_project: stringValue(body.creative_project) || null,
    food_note: stringValue(body.food_note) || null,
    memo: stringValue(body.memo) || null,
    privacy_agreed: true,
    payment_status: "미확인",
    application_status: "대기"
  });

  if (error) {
    console.error("Supabase insert failed:", error.message);
    return jsonError("신청 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.", 500);
  }

  let chatUrl: string | null = null;

  try {
    const openChat = await getOpenChatSettings();
    chatUrl = openChat.chatUrl;
  } catch (openChatError) {
    console.error(
      "Open chat settings load failed:",
      openChatError instanceof Error ? openChatError.message : openChatError
    );
  }

  return NextResponse.json(
    {
      ok: true,
      message: "신청이 접수되었습니다.",
      chatUrl
    },
    { status: 201 }
  );
}
