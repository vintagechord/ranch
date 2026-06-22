import "server-only";

import { Buffer } from "node:buffer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const PARTICIPANT_IMAGE_BUCKET = "participant-images";
const PARTICIPANT_IMAGE_SETTINGS_PATH = "settings/participant-images.json";
const MAX_PARTICIPANT_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_PARTICIPANT_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
]);
const ALLOWED_PARTICIPANT_BUCKET_TYPES = [
  ...ALLOWED_PARTICIPANT_IMAGE_TYPES,
  "application/json"
];

export type ParticipantImageSetting = {
  slotNumber: number;
  displayName: string | null;
  imageUrl: string | null;
  imagePath: string | null;
  updatedAt: string | null;
};

type StoredParticipantImageSlot = {
  displayName?: string | null;
  imageUrl?: string | null;
  imagePath?: string | null;
  updatedAt?: string | null;
};

type ParticipantImageSettingsFile = {
  version: 1;
  slots: Record<string, StoredParticipantImageSlot>;
};

export function parseParticipantSlot(value: FormDataEntryValue | null) {
  const slotNumber = typeof value === "string" ? Number(value) : NaN;

  if (!Number.isSafeInteger(slotNumber) || slotNumber < 1 || slotNumber > 16) {
    throw new Error("참가자 번호가 올바르지 않습니다.");
  }

  return slotNumber;
}

export function normalizeParticipantImageUrl(value: FormDataEntryValue | null) {
  const imageUrl = typeof value === "string" ? value.trim() : "";

  if (!imageUrl) {
    throw new Error("이미지 주소를 입력해 주세요.");
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    throw new Error("올바른 이미지 주소를 입력해 주세요.");
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new Error("이미지 주소는 http 또는 https로 시작해야 합니다.");
  }

  return parsedUrl.toString();
}

export function normalizeParticipantDisplayName(value: FormDataEntryValue | null) {
  const displayName = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

  if (!displayName) {
    return null;
  }

  if (displayName.length > 24) {
    throw new Error("참가자 이름은 24자 이하로 입력해 주세요.");
  }

  return displayName;
}

export function getParticipantFallbackImageUrl(slotNumber: number) {
  return `/participants/participant-${String(slotNumber).padStart(2, "0")}.webp`;
}

function getParticipantSlotKey(slotNumber: number) {
  return String(slotNumber).padStart(2, "0");
}

function createEmptySettingsFile(): ParticipantImageSettingsFile {
  return {
    version: 1,
    slots: {}
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSettingsFile(value: unknown): ParticipantImageSettingsFile {
  if (!isObject(value) || !isObject(value.slots)) {
    return createEmptySettingsFile();
  }

  const settings = createEmptySettingsFile();

  for (const [slotKey, slotValue] of Object.entries(value.slots)) {
    if (!isObject(slotValue) || !/^\d{2}$/.test(slotKey)) {
      continue;
    }

    settings.slots[slotKey] = {
      displayName: typeof slotValue.displayName === "string" ? slotValue.displayName : null,
      imageUrl: typeof slotValue.imageUrl === "string" ? slotValue.imageUrl : null,
      imagePath: typeof slotValue.imagePath === "string" ? slotValue.imagePath : null,
      updatedAt: typeof slotValue.updatedAt === "string" ? slotValue.updatedAt : null
    };
  }

  return settings;
}

function isStorageNotFoundError(error: unknown) {
  const maybeError = error as {
    status?: number;
    statusCode?: number | string;
    message?: string;
  };

  return (
    maybeError.status === 404 ||
    maybeError.statusCode === 404 ||
    maybeError.statusCode === "404" ||
    maybeError.message?.toLowerCase().includes("not found")
  );
}

async function ensureParticipantImageBucket() {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.getBucket(PARTICIPANT_IMAGE_BUCKET);
  const bucketOptions = {
    public: true,
    fileSizeLimit: MAX_PARTICIPANT_IMAGE_BYTES,
    allowedMimeTypes: ALLOWED_PARTICIPANT_BUCKET_TYPES
  };

  if (!error) {
    const { error: updateError } = await supabase.storage.updateBucket(
      PARTICIPANT_IMAGE_BUCKET,
      bucketOptions
    );

    if (updateError) {
      throw new Error(updateError.message);
    }

    return supabase;
  }

  const { error: createError } = await supabase.storage.createBucket(
    PARTICIPANT_IMAGE_BUCKET,
    bucketOptions
  );

  if (createError && !createError.message.toLowerCase().includes("already exists")) {
    throw new Error(createError.message);
  }

  return supabase;
}

async function readParticipantImageSettingsFile() {
  const supabase = await ensureParticipantImageBucket();
  const { data, error } = await supabase.storage
    .from(PARTICIPANT_IMAGE_BUCKET)
    .download(PARTICIPANT_IMAGE_SETTINGS_PATH);

  if (error) {
    if (isStorageNotFoundError(error)) {
      return createEmptySettingsFile();
    }

    throw new Error(error.message);
  }

  try {
    return normalizeSettingsFile(JSON.parse(await data.text()));
  } catch {
    return createEmptySettingsFile();
  }
}

async function writeParticipantImageSettingsFile(settings: ParticipantImageSettingsFile) {
  const supabase = await ensureParticipantImageBucket();
  const fileBuffer = Buffer.from(JSON.stringify(settings, null, 2));
  const { error } = await supabase.storage
    .from(PARTICIPANT_IMAGE_BUCKET)
    .upload(PARTICIPANT_IMAGE_SETTINGS_PATH, fileBuffer, {
      contentType: "application/json",
      cacheControl: "0",
      upsert: true
    });

  if (error) {
    throw new Error(error.message);
  }
}

export async function getParticipantImageSettings() {
  const settings = await readParticipantImageSettingsFile();

  return Array.from({ length: 16 }, (_, index) => {
    const slotNumber = index + 1;
    const slot = settings.slots[getParticipantSlotKey(slotNumber)];

    return {
      slotNumber,
      displayName: slot?.displayName ?? null,
      imageUrl: slot?.imageUrl ?? null,
      imagePath: slot?.imagePath ?? null,
      updatedAt: slot?.updatedAt ?? null
    } satisfies ParticipantImageSetting;
  });
}

export async function getParticipantImageUrlBySlot() {
  const settings = await getParticipantImageSettings();

  return new Map(
    settings
      .filter((setting) => Boolean(setting.imageUrl))
      .map((setting) => [setting.slotNumber, setting.imageUrl as string])
  );
}

export async function getParticipantDisplayNameBySlot() {
  const settings = await getParticipantImageSettings();

  return new Map(
    settings
      .filter((setting) => Boolean(setting.displayName))
      .map((setting) => [setting.slotNumber, setting.displayName as string])
  );
}

function getParticipantImageExtension(file: File) {
  if (file.type === "image/jpeg") {
    return "jpg";
  }

  if (file.type === "image/png") {
    return "png";
  }

  if (file.type === "image/gif") {
    return "gif";
  }

  return "webp";
}

export function validateParticipantImageFile(fileValue: FormDataEntryValue | null) {
  if (!(fileValue instanceof File) || fileValue.size === 0) {
    throw new Error("업로드할 이미지 파일을 선택해 주세요.");
  }

  if (!ALLOWED_PARTICIPANT_IMAGE_TYPES.has(fileValue.type)) {
    throw new Error("이미지 파일은 jpg, png, webp, gif만 업로드할 수 있습니다.");
  }

  if (fileValue.size > MAX_PARTICIPANT_IMAGE_BYTES) {
    throw new Error("이미지 파일은 4MB 이하로 업로드해 주세요.");
  }

  return fileValue;
}

export async function saveParticipantImageUrl(slotNumber: number, imageUrl: string) {
  const settings = await readParticipantImageSettingsFile();
  const slotKey = getParticipantSlotKey(slotNumber);
  const currentSlot = settings.slots[slotKey] ?? {};

  settings.slots[slotKey] = {
    ...currentSlot,
    imageUrl,
    imagePath: null,
    updatedAt: new Date().toISOString()
  };

  await writeParticipantImageSettingsFile(settings);
}

export async function saveParticipantDisplayName(
  slotNumber: number,
  displayName: string | null
) {
  const settings = await readParticipantImageSettingsFile();
  const slotKey = getParticipantSlotKey(slotNumber);
  const currentSlot = settings.slots[slotKey] ?? {};

  settings.slots[slotKey] = {
    ...currentSlot,
    displayName,
    updatedAt: new Date().toISOString()
  };

  await writeParticipantImageSettingsFile(settings);
}

export async function uploadParticipantImage(slotNumber: number, file: File) {
  const supabase = await ensureParticipantImageBucket();
  const extension = getParticipantImageExtension(file);
  const filePath = `slot-${String(slotNumber).padStart(2, "0")}/${Date.now()}.${extension}`;
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(PARTICIPANT_IMAGE_BUCKET)
    .upload(filePath, fileBuffer, {
      contentType: file.type,
      upsert: true
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data } = supabase.storage.from(PARTICIPANT_IMAGE_BUCKET).getPublicUrl(filePath);
  const imageUrl = data.publicUrl;

  const settings = await readParticipantImageSettingsFile();
  const slotKey = getParticipantSlotKey(slotNumber);
  const currentSlot = settings.slots[slotKey] ?? {};

  settings.slots[slotKey] = {
    ...currentSlot,
    imageUrl,
    imagePath: filePath,
    updatedAt: new Date().toISOString()
  };

  await writeParticipantImageSettingsFile(settings);

  return imageUrl;
}
