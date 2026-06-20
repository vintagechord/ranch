import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const OPEN_CHAT_SETTINGS_ID = 1;

type OpenChatSettingsRow = {
  chat_url: string | null;
  updated_at: string | null;
};

export type OpenChatSettings = {
  chatUrl: string | null;
  updatedAt: string | null;
};

function normalizeOpenChatSettings(row: OpenChatSettingsRow | null): OpenChatSettings {
  return {
    chatUrl: row?.chat_url?.trim() || null,
    updatedAt: row?.updated_at ?? null
  };
}

export function normalizeOpenChatUrl(value: string) {
  const chatUrl = value.trim();

  if (!chatUrl) {
    throw new Error("오픈채팅방 링크를 입력해 주세요.");
  }

  let parsed: URL;

  try {
    parsed = new URL(chatUrl);
  } catch {
    throw new Error("오픈채팅방 링크 형식이 올바르지 않습니다.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("오픈채팅방 링크는 http 또는 https 주소여야 합니다.");
  }

  return chatUrl;
}

export async function getOpenChatSettings(): Promise<OpenChatSettings> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("open_chat_settings")
    .select("chat_url, updated_at")
    .eq("id", OPEN_CHAT_SETTINGS_ID)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeOpenChatSettings(data as OpenChatSettingsRow | null);
}

export async function setOpenChatUrl(chatUrl: string): Promise<OpenChatSettings> {
  const normalizedUrl = normalizeOpenChatUrl(chatUrl);
  const updatedAt = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("open_chat_settings")
    .upsert(
      {
        id: OPEN_CHAT_SETTINGS_ID,
        chat_url: normalizedUrl,
        updated_at: updatedAt
      },
      { onConflict: "id" }
    )
    .select("chat_url, updated_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeOpenChatSettings(data as OpenChatSettingsRow);
}
