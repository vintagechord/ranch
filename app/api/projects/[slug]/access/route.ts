import { NextResponse } from "next/server";
import {
  createProjectAccessCookieValue,
  getProjectAccessCookieName,
  getProjectAccessCookieOptions,
  getProjectAccessSetting,
  verifyProjectAccessPassword
} from "@/lib/projectAccess.server";
import { getProjectBySlug } from "@/lib/projects";
import { createRequestFingerprint } from "@/lib/requestFingerprint";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const ACCESS_RATE_LIMIT_SCOPE = "project-access";
const ACCESS_RATE_LIMIT_MAX = 5;
const ACCESS_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
const MAX_FORM_BYTES = 2_048;
const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0",
  Pragma: "no-cache"
};

type RouteContext = {
  params: Promise<{ slug: string }>;
};

function safeErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return "unknown";
  }

  return typeof error.code === "string" ? error.code : "unknown";
}

function redirectToProject(request: Request, projectSlug: string | null, error?: string) {
  const target = new URL(
    projectSlug ? `/projects/${encodeURIComponent(projectSlug)}` : "/",
    request.url
  );

  if (error) {
    target.searchParams.set("access", error);
  }

  const response = NextResponse.redirect(target, 303);

  if (error === "rate") {
    response.headers.set("Retry-After", String(ACCESS_RATE_LIMIT_WINDOW_SECONDS));
  }

  for (const [name, value] of Object.entries(PRIVATE_RESPONSE_HEADERS)) {
    response.headers.set(name, value);
  }

  return response;
}

async function readBoundedFormBody(request: Request) {
  if (!request.body) {
    return "";
  }

  const declaredLength = request.headers.get("content-length");

  if (declaredLength) {
    const parsedLength = Number(declaredLength);

    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > MAX_FORM_BYTES) {
      return null;
    }
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

    if (totalBytes > MAX_FORM_BYTES) {
      await reader.cancel();
      return null;
    }

    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8", { fatal: true }).decode(body);
}

export async function POST(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const project = getProjectBySlug(slug);

  if (!project) {
    return redirectToProject(request, null, "unavailable");
  }

  const requestOrigin = request.headers.get("origin");

  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return redirectToProject(request, project.slug, "unavailable");
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.split(";", 1)[0]?.trim() !== "application/x-www-form-urlencoded") {
    return redirectToProject(request, project.slug, "invalid");
  }

  let rawBody: string | null = null;

  try {
    rawBody = await readBoundedFormBody(request);
  } catch (error) {
    console.error("Project access form read failed:", safeErrorCode(error));
    return redirectToProject(request, project.slug, "invalid");
  }

  if (rawBody === null) {
    return redirectToProject(request, project.slug, "invalid");
  }

  const form = new URLSearchParams(rawBody);
  const passwords = form.getAll("password");
  const password = passwords.length === 1 ? passwords[0] : "";

  let setting: Awaited<ReturnType<typeof getProjectAccessSetting>>;

  try {
    setting = await getProjectAccessSetting(project.slug);
  } catch (error) {
    console.error("Project access setting read failed:", safeErrorCode(error));
    return redirectToProject(request, project.slug, "unavailable");
  }

  if (!setting) {
    return redirectToProject(request, project.slug, "unavailable");
  }

  if (!setting.passwordHash) {
    return redirectToProject(request, project.slug);
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  let fingerprint = "";

  try {
    supabase = getSupabaseAdmin();
    fingerprint = createRequestFingerprint(request, `${ACCESS_RATE_LIMIT_SCOPE}:${project.slug}`);
    const { data: allowed, error } = await supabase.rpc("consume_request_rate_limit", {
      p_scope: ACCESS_RATE_LIMIT_SCOPE,
      p_request_fingerprint: fingerprint,
      p_max_attempts: ACCESS_RATE_LIMIT_MAX,
      p_window_seconds: ACCESS_RATE_LIMIT_WINDOW_SECONDS
    });

    if (error) {
      console.error("Project access rate limit failed:", error.code ?? "unknown");
      return redirectToProject(request, project.slug, "unavailable");
    }

    if (!allowed) {
      return redirectToProject(request, project.slug, "rate");
    }
  } catch (error) {
    console.error("Project access rate limit unavailable:", safeErrorCode(error));
    return redirectToProject(request, project.slug, "unavailable");
  }

  if (!(await verifyProjectAccessPassword(password, setting.passwordHash))) {
    return redirectToProject(request, project.slug, "invalid");
  }

  let cookieValue = "";

  try {
    cookieValue = createProjectAccessCookieValue(project.slug, setting.accessVersion);
  } catch (error) {
    console.error("Project access session creation failed:", safeErrorCode(error));
    return redirectToProject(request, project.slug, "unavailable");
  }

  const { error: clearError } = await supabase.rpc("clear_request_rate_limit", {
    p_scope: ACCESS_RATE_LIMIT_SCOPE,
    p_request_fingerprint: fingerprint
  });

  if (clearError) {
    console.error("Project access rate limit clear failed:", clearError.code ?? "unknown");
  }

  const response = redirectToProject(request, project.slug);
  response.cookies.set(
    getProjectAccessCookieName(project.slug),
    cookieValue,
    getProjectAccessCookieOptions()
  );

  return response;
}
