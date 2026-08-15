import { NextResponse } from "next/server";
import {
  RELEASE_APPLICATION_PRIVACY_VERSION,
  RELEASE_CREDIT_PUBLICATION_VERSION
} from "@/lib/releaseParticipation";
import {
  createRequestFingerprint,
  createScopedPayloadHash,
  createValueFingerprint
} from "@/lib/requestFingerprint";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type ReleaseApplicationPayload = {
  submission_type?: unknown;
  lead_id?: unknown;
  idempotency_key?: unknown;
  name?: unknown;
  credit_name?: unknown;
  email?: unknown;
  phone?: unknown;
  profile_url?: unknown;
  portfolio_url?: unknown;
  availability?: unknown;
  message?: unknown;
  privacy_agreed?: unknown;
  credit_publication_agreed?: unknown;
  website?: unknown;
};

const MAX_REQUEST_BYTES = 50_000;
const SUCCESS_MESSAGE = "참여 요청이 접수되었습니다.";
const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0"
};
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(
  body: { ok: boolean; message: string },
  status: number,
  headers?: Record<string, string>
) {
  return NextResponse.json(body, {
    status,
    headers: { ...PRIVATE_RESPONSE_HEADERS, ...headers }
  });
}

function jsonError(message: string, status: number, headers?: Record<string, string>) {
  return jsonResponse({ ok: false, message }, status, headers);
}

function successResponse() {
  return jsonResponse({ ok: true, message: SUCCESS_MESSAGE }, 201);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown) {
  const text = stringValue(value);
  return text || null;
}

function codePointLength(value: string) {
  return Array.from(value).length;
}

function safeErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return "unknown";
  }

  return typeof error.code === "string" ? error.code : "unknown";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeHttpsUrl(value: unknown) {
  const text = stringValue(value);

  if (!text) {
    return null;
  }

  if (codePointLength(text) > 1000) {
    return undefined;
  }

  try {
    const url = new URL(text);

    if (url.protocol !== "https:" || url.username || url.password) {
      return undefined;
    }

    const normalized = url.toString();
    return codePointLength(normalized) <= 1000 ? normalized : undefined;
  } catch {
    return undefined;
  }
}

async function readRequestBody(request: Request) {
  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    totalBytes += value.byteLength;

    if (totalBytes > MAX_REQUEST_BYTES) {
      await reader.cancel();
      return null;
    }

    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;

  chunks.forEach((chunk) => {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  });

  return new TextDecoder("utf-8", { fatal: true }).decode(body);
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.split(";", 1)[0]?.trim() !== "application/json") {
    return jsonError("JSON 형식의 참여 요청만 접수할 수 있습니다.", 415);
  }

  let rawBody = "";

  try {
    const body = await readRequestBody(request);

    if (body === null) {
      return jsonError("참여 요청 내용이 너무 깁니다.", 413);
    }

    rawBody = body;
  } catch (error) {
    console.error("Release application body read failed:", safeErrorCode(error));
    return jsonError("참여 요청을 읽지 못했습니다.", 400);
  }

  let parsedBody: unknown;

  try {
    parsedBody = JSON.parse(rawBody) as unknown;
  } catch (error) {
    console.error("Release application JSON parse failed:", safeErrorCode(error));
    return jsonError("참여 요청을 읽지 못했습니다.", 400);
  }

  if (!isPlainObject(parsedBody)) {
    return jsonError("올바른 참여 요청이 아닙니다.", 400);
  }

  const body = parsedBody as ReleaseApplicationPayload;

  if (stringValue(body.website)) {
    return successResponse();
  }

  if (body.submission_type !== "release_participation") {
    return jsonError("올바른 참여 요청이 아닙니다.", 400);
  }

  const leadId = stringValue(body.lead_id).toLowerCase();
  const idempotencyKey = stringValue(body.idempotency_key).toLowerCase();
  const name = stringValue(body.name);
  const creditName = stringValue(body.credit_name);
  const email = stringValue(body.email).toLowerCase();
  const phone = nullableString(body.phone);
  const availability = stringValue(body.availability);
  const message = stringValue(body.message);

  if (!UUID_PATTERN.test(leadId) || !UUID_PATTERN.test(idempotencyKey)) {
    return jsonError("참여 요청을 새로 열어 다시 시도해 주세요.", 400);
  }

  const requiredFields: Array<[string, number, number]> = [
    [name, 1, 80],
    [creditName, 1, 80],
    [email, 3, 254],
    [availability, 1, 500],
    [message, 10, 2000]
  ];

  if (
    requiredFields.some(
      ([value, min, max]) => codePointLength(value) < min || codePointLength(value) > max
    )
  ) {
    return jsonError("필수 항목과 입력 길이를 확인해 주세요.", 400);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError("이메일 주소를 확인해 주세요.", 400);
  }

  if (
    phone &&
    (codePointLength(phone) < 7 ||
      codePointLength(phone) > 40 ||
      !/^[0-9+().\-\s]+$/.test(phone))
  ) {
    return jsonError("연락처를 확인해 주세요.", 400);
  }

  const profileUrl = normalizeHttpsUrl(body.profile_url);
  const portfolioUrl = normalizeHttpsUrl(body.portfolio_url);

  if (profileUrl === undefined || portfolioUrl === undefined) {
    return jsonError("프로필과 포트폴리오는 https://로 시작하는 주소를 입력해 주세요.", 400);
  }

  if (body.privacy_agreed !== true) {
    return jsonError("개인정보 수집 및 이용 동의가 필요합니다.", 400);
  }

  if (body.credit_publication_agreed !== true) {
    return jsonError("선정 후 크레딧 공개 및 보관 동의가 필요합니다.", 400);
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  let requestFingerprint = "";
  let emailFingerprint = "";
  let payloadHash = "";

  try {
    supabase = getSupabaseAdmin();
    requestFingerprint = createRequestFingerprint(request, "release-participation");
    emailFingerprint = createValueFingerprint(
      "release-participation-email",
      `${leadId}\0${email}`
    );
    payloadHash = createScopedPayloadHash("release-participation", {
      release_role_id: leadId,
      applicant_name: name,
      credit_name: creditName,
      email,
      phone,
      profile_url: profileUrl,
      portfolio_url: portfolioUrl,
      availability,
      message,
      privacy_notice_version: RELEASE_APPLICATION_PRIVACY_VERSION,
      credit_publication_notice_version: RELEASE_CREDIT_PUBLICATION_VERSION
    });
  } catch (error) {
    console.error("Release application server configuration failed:", safeErrorCode(error));
    return jsonError("지금은 참여 요청을 접수할 수 없습니다. 잠시 후 다시 시도해 주세요.", 500);
  }

  try {
    const { data: result, error } = await supabase.rpc(
      "submit_release_participation_application",
      {
        p_release_role_id: leadId,
        p_applicant_name: name,
        p_credit_name: creditName,
        p_email: email,
        p_phone: phone,
        p_profile_url: profileUrl,
        p_portfolio_url: portfolioUrl,
        p_availability: availability,
        p_message: message,
        p_privacy_notice_version: RELEASE_APPLICATION_PRIVACY_VERSION,
        p_credit_publication_notice_version: RELEASE_CREDIT_PUBLICATION_VERSION,
        p_idempotency_key: idempotencyKey,
        p_payload_hash: payloadHash,
        p_request_fingerprint: requestFingerprint,
        p_email_fingerprint: emailFingerprint
      }
    );

    if (error) {
      console.error("Release application RPC failed:", safeErrorCode(error));
      return jsonError("참여 요청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", 500);
    }

    if (result === "rate_limited") {
      return jsonError("잠시 후 다시 요청해 주세요.", 429, { "Retry-After": "900" });
    }

    if (result === "email_rate_limited") {
      return jsonError("같은 참여 파트에는 하루 뒤 다시 요청할 수 있습니다.", 429, {
        "Retry-After": "86400"
      });
    }

    if (result === "conflict") {
      return jsonError("요청 내용이 변경되었습니다. 다시 한 번 전송해 주세요.", 409);
    }

    if (result === "unavailable") {
      return jsonError("이 참여 파트의 모집이 마감되었거나 일시 중지되었습니다.", 409);
    }

    if (result !== "inserted" && result !== "duplicate") {
      console.error("Release application RPC returned an unknown status.");
      return jsonError("참여 요청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", 500);
    }
  } catch (error) {
    console.error("Release application save failed:", safeErrorCode(error));
    return jsonError("참여 요청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", 500);
  }

  return successResponse();
}
