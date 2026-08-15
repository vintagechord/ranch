import "server-only";

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const RELEASE_COVER_BUCKET = "release-covers";
export const MAX_RELEASE_COVER_FILE_BYTES = 3 * 1024 * 1024;

const MAX_RELEASE_COVER_PIXELS = 40_000_000;
const MAX_RELEASE_COVER_EDGE = 1600;
const MAX_CLEANUP_BATCH_SIZE = 50;
const MAX_CLEANUP_ATTEMPTS = 20;
const MAX_CLEANUP_ERROR_LENGTH = 500;
const RELEASE_COVER_PATH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/;
const ACCEPTED_INPUT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif"
]);
const ACCEPTED_DECODED_FORMATS = new Set(["jpeg", "png", "webp", "avif", "heif"]);

export type ReleaseCoverValidationCode = "empty" | "too_large" | "invalid_type" | "invalid_image";

export class ReleaseCoverValidationError extends Error {
  code: ReleaseCoverValidationCode;

  constructor(code: ReleaseCoverValidationCode) {
    super(code);
    this.name = "ReleaseCoverValidationError";
    this.code = code;
  }
}

export async function normalizeReleaseCover(file: File) {
  if (file.size <= 0) {
    throw new ReleaseCoverValidationError("empty");
  }
  if (file.size > MAX_RELEASE_COVER_FILE_BYTES) {
    throw new ReleaseCoverValidationError("too_large");
  }
  if (!ACCEPTED_INPUT_TYPES.has(file.type)) {
    throw new ReleaseCoverValidationError("invalid_type");
  }

  const input = Buffer.from(await file.arrayBuffer());

  try {
    const metadata = await sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_RELEASE_COVER_PIXELS,
      sequentialRead: true
    }).metadata();

    if (
      !metadata.format ||
      !ACCEPTED_DECODED_FORMATS.has(metadata.format) ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > MAX_RELEASE_COVER_PIXELS
    ) {
      throw new ReleaseCoverValidationError("invalid_image");
    }

    const output = await sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_RELEASE_COVER_PIXELS,
      sequentialRead: true
    })
      .rotate()
      .resize({
        width: MAX_RELEASE_COVER_EDGE,
        height: MAX_RELEASE_COVER_EDGE,
        fit: "inside",
        withoutEnlargement: true
      })
      .webp({ quality: 88, effort: 4 })
      .toBuffer();

    if (output.length > MAX_RELEASE_COVER_FILE_BYTES) {
      throw new ReleaseCoverValidationError("too_large");
    }

    return output;
  } catch (error) {
    if (error instanceof ReleaseCoverValidationError) {
      throw error;
    }
    throw new ReleaseCoverValidationError("invalid_image");
  }
}

export async function uploadReleaseCoverObject(releaseId: string, body: Buffer) {
  const path = `${releaseId}/${randomUUID()}.webp`;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(RELEASE_COVER_BUCKET).upload(path, body, {
    cacheControl: "31536000",
    contentType: "image/webp",
    upsert: false
  });

  if (error) {
    throw new Error(`release_cover_upload:${error.name}`);
  }

  const { data } = supabase.storage.from(RELEASE_COVER_BUCKET).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

export async function removeReleaseCoverObject(path: string) {
  validateReleaseCoverPath(path);
  const supabase = getSupabaseAdmin();
  return supabase.storage.from(RELEASE_COVER_BUCKET).remove([path]);
}

function validateReleaseCoverPath(path: string) {
  if (!RELEASE_COVER_PATH_PATTERN.test(path)) {
    throw new Error("release_cover_cleanup:invalid_path");
  }
}

function cleanupErrorMessage(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "release_cover_cleanup:unknown_error";
  const normalized = message.trim();

  return (normalized || "release_cover_cleanup:unknown_error").slice(
    0,
    MAX_CLEANUP_ERROR_LENGTH
  );
}

function nextCleanupAttempt(attemptCount: number) {
  const delayMinutes = Math.min(2 ** Math.max(attemptCount - 1, 0), 24 * 60);
  return new Date(Date.now() + delayMinutes * 60_000).toISOString();
}

export async function enqueueReleaseCoverCleanup(path: string, cause?: unknown) {
  validateReleaseCoverPath(path);

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("release_cover_cleanup_queue")
    .upsert({
      path,
      attempt_count: 0,
      last_error: cause === undefined ? null : cleanupErrorMessage(cause),
      next_attempt_at: new Date().toISOString()
    }, { onConflict: "path" });

  if (error) {
    throw new Error(`release_cover_cleanup_enqueue:${error.code}`);
  }
}

export type ReleaseCoverCleanupProcessResult = {
  selected: number;
  removed: number;
  skippedReferenced: number;
  deferred: number;
};

export async function processReleaseCoverCleanupQueue(
  batchSize = 10
): Promise<ReleaseCoverCleanupProcessResult> {
  const safeBatchSize = Number.isSafeInteger(batchSize)
    ? Math.min(Math.max(batchSize, 1), MAX_CLEANUP_BATCH_SIZE)
    : 10;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("release_cover_cleanup_queue")
    .select("path, attempt_count")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(safeBatchSize);

  if (error) {
    throw new Error(`release_cover_cleanup_load:${error.code}`);
  }

  const result: ReleaseCoverCleanupProcessResult = {
    selected: data.length,
    removed: 0,
    skippedReferenced: 0,
    deferred: 0
  };

  for (const item of data) {
    const defer = async (cause: unknown) => {
      const attemptCount = Math.min(item.attempt_count + 1, MAX_CLEANUP_ATTEMPTS);
      result.deferred += 1;
      try {
        const { error: deferError } = await supabase
          .from("release_cover_cleanup_queue")
          .update({
            attempt_count: attemptCount,
            last_error: cleanupErrorMessage(cause),
            next_attempt_at: nextCleanupAttempt(attemptCount)
          })
          .eq("path", item.path);

        if (deferError) {
          console.error(`Release cover cleanup defer failed: ${item.path}: ${deferError.code}`);
        }
      } catch (deferError) {
        console.error(`Release cover cleanup defer failed: ${item.path}:`, deferError);
      }
    };

    try {
      const { count: referenceCount, error: referenceError } = await supabase
        .from("music_releases")
        .select("id", { count: "exact", head: true })
        .eq("cover_image_path", item.path);

      if (referenceError) {
        await defer(referenceError.message);
        continue;
      }

      if ((referenceCount ?? 0) > 0) {
        const { error: discardError } = await supabase
          .from("release_cover_cleanup_queue")
          .delete()
          .eq("path", item.path);

        if (discardError) {
          await defer(discardError.message);
        } else {
          result.skippedReferenced += 1;
        }
        continue;
      }

      const { error: storageError } = await removeReleaseCoverObject(item.path);

      if (storageError) {
        await defer(storageError.message);
        continue;
      }

      const { error: deleteError } = await supabase
        .from("release_cover_cleanup_queue")
        .delete()
        .eq("path", item.path);

      if (deleteError) {
        await defer(deleteError.message);
        continue;
      }

      result.removed += 1;
    } catch (itemError) {
      await defer(itemError);
    }
  }

  return result;
}
