import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";

const ADMIN_COOKIE_NAME = "ranch_admin";
const ADMIN_TOKEN_INPUT = "ranch-morning-admin";

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD ?? "";
}

function getAdminToken() {
  const password = getAdminPassword();

  if (!password) {
    return "";
  }

  return crypto.createHmac("sha256", password).update(ADMIN_TOKEN_INPUT).digest("hex");
}

function timingSafeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export function isAdminConfigured() {
  return Boolean(getAdminPassword());
}

export function verifyAdminPassword(password: string) {
  const expected = getAdminPassword();

  if (!expected) {
    return false;
  }

  return timingSafeEqual(password, expected);
}

export function createAdminCookieValue() {
  return getAdminToken();
}

export async function isAdminAuthenticated() {
  const expectedToken = getAdminToken();

  if (!expectedToken) {
    return false;
  }

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(ADMIN_COOKIE_NAME)?.value ?? "";

  return timingSafeEqual(cookieValue, expectedToken);
}

export { ADMIN_COOKIE_NAME };
