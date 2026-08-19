import { NextResponse } from "next/server";
import {
  PROJECT_BUDGET_RANGES,
  PROJECT_PROPOSAL_PRIVACY_VERSION,
  PROJECT_STAGES,
  PROJECT_SUPPORT_OPTIONS,
  PROJECT_TYPES
} from "@/lib/projectProposals";
import { createPayloadHash, createRequestFingerprint } from "@/lib/requestFingerprint";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type ProposalPayload = {
  submission_type?: unknown;
  idempotency_key?: unknown;
  name?: unknown;
  phone?: unknown;
  project_title?: unknown;
  project_type?: unknown;
  current_stage?: unknown;
  support_needed?: unknown;
  desired_schedule?: unknown;
  budget_range?: unknown;
  reference_url?: unknown;
  details?: unknown;
  privacy_agreed?: unknown;
  website?: unknown;
};

const MAX_REQUEST_BYTES = 50_000;
const SUCCESS_MESSAGE = "프로젝트 제안이 접수되었습니다.";
const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0"
};

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { ok: false, message },
    { status, headers: PRIVATE_RESPONSE_HEADERS }
  );
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

function isAllowed<T extends readonly string[]>(options: T, value: string): value is T[number] {
  return options.includes(value as T[number]);
}

function normalizeReferenceUrl(value: unknown) {
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

function successResponse() {
  return NextResponse.json(
    { ok: true, message: SUCCESS_MESSAGE },
    { status: 201, headers: PRIVATE_RESPONSE_HEADERS }
  );
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.split(";", 1)[0]?.trim() !== "application/json") {
    return jsonError("JSON 형식의 제안서만 접수할 수 있습니다.", 415);
  }

  let rawBody = "";

  try {
    const body = await readRequestBody(request);

    if (body === null) {
      return jsonError("제안서 내용이 너무 깁니다.", 413);
    }

    rawBody = body;
  } catch (error) {
    console.error("Project proposal body read failed:", safeErrorCode(error));
    return jsonError("제안서를 읽지 못했습니다.", 400);
  }

  let parsedBody: unknown;

  try {
    parsedBody = JSON.parse(rawBody) as unknown;
  } catch (error) {
    console.error("Project proposal JSON parse failed:", safeErrorCode(error));
    return jsonError("제안서를 읽지 못했습니다.", 400);
  }

  if (!isPlainObject(parsedBody)) {
    return jsonError("올바른 제안서가 아닙니다.", 400);
  }

  const body = parsedBody as ProposalPayload;

  if (stringValue(body.website)) {
    return successResponse();
  }

  if (body.submission_type !== "project_proposal") {
    return jsonError("올바른 제안서가 아닙니다.", 400);
  }

  const idempotencyKey = stringValue(body.idempotency_key).toLowerCase();
  const name = stringValue(body.name);
  const phone = stringValue(body.phone);
  const projectTitle = stringValue(body.project_title);
  const projectType = stringValue(body.project_type);
  const currentStage = stringValue(body.current_stage);
  const desiredSchedule = nullableString(body.desired_schedule);
  const budgetRange = nullableString(body.budget_range);
  const details = stringValue(body.details);
  const supportNeeded = Array.isArray(body.support_needed)
    ? [...new Set(body.support_needed.map(stringValue).filter(Boolean))]
    : [];

  const requiredFields: Array<[string, number, number]> = [
    [name, 1, 80],
    [phone, 7, 40],
    [projectTitle, 1, 140],
    [details, 20, 3000]
  ];

  if (
    requiredFields.some(
      ([value, min, max]) => codePointLength(value) < min || codePointLength(value) > max
    )
  ) {
    return jsonError("필수 항목과 입력 길이를 확인해 주세요.", 400);
  }

  if (!/^[0-9+().\-\s]+$/.test(phone)) {
    return jsonError("연락처를 확인해 주세요.", 400);
  }

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)
  ) {
    return jsonError("제안서를 새로 열어 다시 시도해 주세요.", 400);
  }

  if (
    !isAllowed(PROJECT_TYPES, projectType) ||
    !isAllowed(PROJECT_STAGES, currentStage) ||
    supportNeeded.length === 0 ||
    supportNeeded.some((item) => !isAllowed(PROJECT_SUPPORT_OPTIONS, item))
  ) {
    return jsonError("프로젝트 유형과 필요한 작업을 확인해 주세요.", 400);
  }

  if (desiredSchedule && codePointLength(desiredSchedule) > 120) {
    return jsonError("희망 일정은 120자 이내로 입력해 주세요.", 400);
  }

  if (budgetRange && !isAllowed(PROJECT_BUDGET_RANGES, budgetRange)) {
    return jsonError("예산 범위를 확인해 주세요.", 400);
  }

  const referenceUrl = normalizeReferenceUrl(body.reference_url);

  if (referenceUrl === undefined) {
    return jsonError("참고 링크는 https://로 시작하는 주소를 입력해 주세요.", 400);
  }

  if (body.privacy_agreed !== true) {
    return jsonError("개인정보 수집 및 이용 동의가 필요합니다.", 400);
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  let fingerprint = "";
  let payloadHash = "";

  try {
    supabase = getSupabaseAdmin();
    fingerprint = createRequestFingerprint(request, "project-proposal");
    payloadHash = createPayloadHash({
      contact_name: name,
      phone,
      email: null,
      artist_name: null,
      project_title: projectTitle,
      project_type: projectType,
      current_stage: currentStage,
      support_needed: [...supportNeeded].sort(),
      desired_schedule: desiredSchedule,
      budget_range: budgetRange,
      reference_url: referenceUrl,
      details,
      privacy_notice_version: PROJECT_PROPOSAL_PRIVACY_VERSION
    });
  } catch (error) {
    console.error("Project proposal server configuration failed:", safeErrorCode(error));
    return jsonError("지금은 제안서를 접수할 수 없습니다. 잠시 후 다시 시도해 주세요.", 500);
  }

  try {
    const { data: result, error } = await supabase.rpc("submit_project_proposal", {
      p_contact_name: name,
      p_phone: phone,
      p_email: null,
      p_artist_name: null,
      p_project_title: projectTitle,
      p_project_type: projectType,
      p_current_stage: currentStage,
      p_support_needed: [...supportNeeded].sort(),
      p_desired_schedule: desiredSchedule,
      p_budget_range: budgetRange,
      p_reference_url: referenceUrl,
      p_details: details,
      p_privacy_notice_version: PROJECT_PROPOSAL_PRIVACY_VERSION,
      p_idempotency_key: idempotencyKey,
      p_payload_hash: payloadHash,
      p_request_fingerprint: fingerprint
    });

    if (error) {
      console.error("Project proposal RPC failed:", safeErrorCode(error));
      return jsonError("제안서를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", 500);
    }

    if (result === "rate_limited") {
      return jsonError("잠시 후 다시 제안해 주세요.", 429);
    }

    if (result === "conflict") {
      return jsonError("제안 내용이 변경되었습니다. 다시 한 번 전송해 주세요.", 409);
    }

    if (result !== "inserted" && result !== "duplicate") {
      console.error("Project proposal RPC returned an unknown status.");
      return jsonError("제안서를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", 500);
    }
  } catch (error) {
    console.error("Project proposal save failed:", safeErrorCode(error));
    return jsonError("제안서를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", 500);
  }

  return successResponse();
}
