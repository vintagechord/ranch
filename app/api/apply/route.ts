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

export async function POST(request: Request) {
  let body: ApplyPayload;

  try {
    body = (await request.json()) as ApplyPayload;
  } catch {
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
    console.error(
      "Supabase client configuration failed:",
      error instanceof Error ? error.message : error
    );
    return jsonError("신청 중 오류가 발생했습니다.", 500);
  }

  const application: RanchApplicationInsert = {
    name,
    phone,
    email: nullableString(body.email),
    instagram: nullableString(body.instagram),
    attendees: nullablePositiveInteger(body.attendees),
    message: nullableString(body.message)
  };

  const { error } = await supabase.from("ranch_applications").insert(application);

  if (error) {
    console.error("Supabase insert failed:", error.message);
    return jsonError("신청 중 오류가 발생했습니다.", 500);
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
      message: "신청이 완료되었습니다. 목장에서 만나요 🐄",
      chatUrl
    },
    { status: 201 }
  );
}
