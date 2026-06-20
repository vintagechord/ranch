import { NextResponse } from "next/server";
import { getOpenChatSettings } from "@/lib/openChat";
import { getSupabaseClient, type RanchApplicationInsert } from "@/lib/supabase";

type ApplyPayload = {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  instagram?: unknown;
  attendees?: unknown;
  message?: unknown;
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

function nullableString(value: unknown) {
  const text = stringValue(value);
  return text || null;
}

function nullablePositiveInteger(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = typeof value === "number" ? value : Number(stringValue(value));

  if (!Number.isSafeInteger(numberValue) || numberValue <= 0) {
    return null;
  }

  return numberValue;
}

function booleanValue(value: unknown) {
  return value === true || value === "true" || value === "on";
}

function buildApplicationMessage(body: ApplyPayload) {
  const lines: string[] = [];
  const message = nullableString(body.message);
  const auctionItem = nullableString(body.auction_item);
  const creativeProject = nullableString(body.creative_project);
  const foodNote = nullableString(body.food_note);
  const memo = nullableString(body.memo);

  if (message) {
    lines.push(message);
  }

  if (auctionItem) {
    lines.push(`경매 물품: ${auctionItem}`);
  }

  if (body.advance_team !== undefined) {
    lines.push(`선발대: ${booleanValue(body.advance_team) ? "네" : "아니오"}`);
  }

  if (creativeProject) {
    lines.push(`창작 캠프: ${creativeProject}`);
  }

  if (foodNote) {
    lines.push(`음식 메모: ${foodNote}`);
  }

  if (memo) {
    lines.push(`기타 메모: ${memo}`);
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

export async function POST(request: Request) {
  let body: ApplyPayload;

  try {
    body = (await request.json()) as ApplyPayload;
  } catch (error) {
    console.error("Apply request JSON parse failed:", error);
    return jsonError("신청 중 오류가 발생했습니다.", 400);
  }

  const name = stringValue(body.name);
  const phone = stringValue(body.phone);

  if (!name || !phone) {
    return jsonError("신청 중 오류가 발생했습니다.", 400);
  }

  let supabase: ReturnType<typeof getSupabaseClient>;

  try {
    supabase = getSupabaseClient();
  } catch (error) {
    console.error("Supabase client configuration failed:", error);
    return jsonError("신청 중 오류가 발생했습니다.", 500);
  }

  const application: RanchApplicationInsert = {
    name,
    phone,
    email: nullableString(body.email),
    instagram: nullableString(body.instagram),
    attendees: nullablePositiveInteger(body.attendees),
    message: buildApplicationMessage(body)
  };

  let insertError: {
    message: string;
    code?: string;
    details?: string;
    hint?: string;
  } | null = null;

  try {
    const { error } = await supabase.from("ranch_applications").insert(application);
    insertError = error;
  } catch (error) {
    console.error("Supabase insert request threw:", error);
    return jsonError("신청 중 오류가 발생했습니다.", 500);
  }

  if (insertError) {
    console.error("Supabase insert failed:", {
      message: insertError.message,
      code: insertError.code,
      details: insertError.details,
      hint: insertError.hint
    });
    return jsonError("신청 중 오류가 발생했습니다.", 500);
  }

  let chatUrl: string | null = null;

  try {
    const openChat = await getOpenChatSettings();
    chatUrl = openChat.chatUrl;
  } catch (openChatError) {
    console.error("Open chat settings load failed:", openChatError);
  }

  return NextResponse.json(
    {
      ok: true,
      message: "신청이 완료되었습니다. 목장에서 만나요 🐄",
      chatUrl
    },
    { status: 201 }
  );
}
