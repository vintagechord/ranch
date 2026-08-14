import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminCookieValue,
  isAdminConfigured,
  verifyAdminPassword
} from "@/lib/adminAuth";
import { createRequestFingerprint } from "@/lib/requestFingerprint";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const LOGIN_RATE_LIMIT_MAX = 5;
const LOGIN_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

export async function POST(request: Request) {
  const formData = await request.formData();
  const passwordValue = formData.get("password");
  const password = typeof passwordValue === "string" ? passwordValue : "";

  if (!isAdminConfigured()) {
    return NextResponse.redirect(new URL("/admin?error=config", request.url), 303);
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  let fingerprint = "";

  try {
    supabase = getSupabaseAdmin();
    fingerprint = createRequestFingerprint(request, "admin-login");
    const { data: allowed, error } = await supabase.rpc("consume_request_rate_limit", {
      p_scope: "admin-login",
      p_request_fingerprint: fingerprint,
      p_max_attempts: LOGIN_RATE_LIMIT_MAX,
      p_window_seconds: LOGIN_RATE_LIMIT_WINDOW_SECONDS
    });

    if (error) {
      console.error("Admin login rate limit failed:", error.code ?? "unknown");
      return NextResponse.redirect(new URL("/admin?error=unavailable", request.url), 303);
    }

    if (!allowed) {
      return NextResponse.redirect(new URL("/admin?error=rate", request.url), 303);
    }
  } catch {
    return NextResponse.redirect(new URL("/admin?error=unavailable", request.url), 303);
  }

  if (!verifyAdminPassword(password)) {
    return NextResponse.redirect(new URL("/admin?error=password", request.url), 303);
  }

  const { error: clearError } = await supabase.rpc("clear_request_rate_limit", {
    p_scope: "admin-login",
    p_request_fingerprint: fingerprint
  });

  if (clearError) {
    console.error("Admin login rate limit clear failed:", clearError.code ?? "unknown");
  }

  const response = NextResponse.redirect(new URL("/admin", request.url), 303);
  response.cookies.set(ADMIN_COOKIE_NAME, createAdminCookieValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS
  });

  return response;
}
