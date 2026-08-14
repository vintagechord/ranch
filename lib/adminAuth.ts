import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";

const ADMIN_COOKIE_NAME = "ranch_admin";
const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD ?? "";
}

function signAdminSession(payload: string) {
  const password = getAdminPassword();

  if (!password) {
    return "";
  }

  return crypto.createHmac("sha256", password).update(payload).digest("hex");
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
  const issuedAt = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(18).toString("base64url");
  const payload = `${issuedAt}.${nonce}`;
  const signature = signAdminSession(payload);

  return `${payload}.${signature}`;
}

export async function isAdminAuthenticated() {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(ADMIN_COOKIE_NAME)?.value ?? "";
  const [issuedAtValue, nonce, signature, ...extra] = cookieValue.split(".");

  if (!issuedAtValue || !nonce || !signature || extra.length > 0) {
    return false;
  }

  const issuedAt = Number(issuedAtValue);
  const now = Math.floor(Date.now() / 1000);

  if (
    !Number.isSafeInteger(issuedAt) ||
    issuedAt > now + 60 ||
    now - issuedAt > ADMIN_SESSION_MAX_AGE_SECONDS
  ) {
    return false;
  }

  const expectedSignature = signAdminSession(`${issuedAtValue}.${nonce}`);

  if (!expectedSignature) {
    return false;
  }

  return timingSafeEqual(signature, expectedSignature);
}

export { ADMIN_COOKIE_NAME, ADMIN_SESSION_MAX_AGE_SECONDS };
