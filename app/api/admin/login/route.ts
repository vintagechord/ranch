import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  createAdminCookieValue,
  isAdminConfigured,
  verifyAdminPassword
} from "@/lib/adminAuth";

export async function POST(request: Request) {
  const formData = await request.formData();
  const passwordValue = formData.get("password");
  const password = typeof passwordValue === "string" ? passwordValue : "";

  if (!isAdminConfigured()) {
    return NextResponse.redirect(new URL("/admin?error=config", request.url), 303);
  }

  if (!verifyAdminPassword(password)) {
    return NextResponse.redirect(new URL("/admin?error=password", request.url), 303);
  }

  const response = NextResponse.redirect(new URL("/admin", request.url), 303);
  response.cookies.set(ADMIN_COOKIE_NAME, createAdminCookieValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: 60 * 60 * 8
  });

  return response;
}
