import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const PASSWORD_HASH_SCHEME = "scrypt";
const PASSWORD_HASH_VERSION = "v1";
const SCRYPT_COST = 32_768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_KEY_BYTES = 32;
const SCRYPT_MAX_MEMORY_BYTES = 64 * 1024 * 1024;
const MIN_PASSWORD_BYTES = 1;
const MAX_PASSWORD_BYTES = 512;
const PROJECT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const PROJECT_ACCESS_COOKIE_PREFIX = "ranch_project_access_";
const PROJECT_ACCESS_TOKEN_VERSION = "v1";
const PROJECT_ACCESS_SIGNING_DOMAIN = "ranch-project-access-session-v1";

export const PROJECT_ACCESS_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

export type ProjectAccessSetting = {
  passwordHash: string | null;
  accessVersion: number;
};

type CookieReader = {
  get(name: string): { value: string } | string | undefined;
};

function passwordBytes(password: string) {
  if (typeof password !== "string") {
    return null;
  }

  const encoded = Buffer.from(password, "utf8");
  return encoded.byteLength >= MIN_PASSWORD_BYTES && encoded.byteLength <= MAX_PASSWORD_BYTES
    ? encoded
    : null;
}

function deriveScryptKey(password: Buffer, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      SCRYPT_KEY_BYTES,
      {
        N: SCRYPT_COST,
        r: SCRYPT_BLOCK_SIZE,
        p: SCRYPT_PARALLELIZATION,
        maxmem: SCRYPT_MAX_MEMORY_BYTES
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      }
    );
  });
}

function decodeBase64Url(value: string, expectedBytes: number) {
  if (!BASE64URL_PATTERN.test(value)) {
    return null;
  }

  const decoded = Buffer.from(value, "base64url");

  if (decoded.byteLength !== expectedBytes || decoded.toString("base64url") !== value) {
    return null;
  }

  return decoded;
}

function isValidAccessVersion(accessVersion: number) {
  return Number.isSafeInteger(accessVersion) && accessVersion >= 0;
}

function isValidProjectSlug(projectSlug: string) {
  return projectSlug.length <= 120 && PROJECT_SLUG_PATTERN.test(projectSlug);
}

function getProjectAccessSigningKey() {
  const configuredSecret = process.env.PROJECT_ACCESS_SESSION_SECRET;

  if (configuredSecret) {
    const configuredKey = Buffer.from(configuredSecret, "utf8");

    if (configuredKey.byteLength < 32) {
      throw new Error("PROJECT_ACCESS_SESSION_SECRET must contain at least 32 UTF-8 bytes.");
    }

    return configuredKey;
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("Project access session signing secret is not configured.");
  }

  return crypto
    .createHmac("sha256", serviceRoleKey)
    .update(PROJECT_ACCESS_SIGNING_DOMAIN)
    .digest();
}

function signProjectAccessToken(projectSlug: string, payload: string) {
  return crypto
    .createHmac("sha256", getProjectAccessSigningKey())
    .update(PROJECT_ACCESS_SIGNING_DOMAIN)
    .update("\0")
    .update(projectSlug)
    .update("\0")
    .update(payload)
    .digest("base64url");
}

function timingSafeEqual(left: Buffer, right: Buffer) {
  return left.byteLength === right.byteLength && crypto.timingSafeEqual(left, right);
}

function readCookieValue(cookieReader: CookieReader, name: string) {
  const cookie = cookieReader.get(name);

  if (typeof cookie === "string") {
    return cookie;
  }

  return cookie?.value ?? "";
}

function readRequestCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return "";
  }

  for (const pair of cookieHeader.split(";")) {
    const separatorIndex = pair.indexOf("=");

    if (separatorIndex < 0 || pair.slice(0, separatorIndex).trim() !== name) {
      continue;
    }

    return pair.slice(separatorIndex + 1).trim();
  }

  return "";
}

export async function hashProjectAccessPassword(password: string) {
  const encodedPassword = passwordBytes(password);

  if (!encodedPassword) {
    throw new Error("Project access password must contain between 1 and 512 UTF-8 bytes.");
  }

  const salt = crypto.randomBytes(SCRYPT_SALT_BYTES);
  const derivedKey = await deriveScryptKey(encodedPassword, salt);

  return [
    PASSWORD_HASH_SCHEME,
    PASSWORD_HASH_VERSION,
    String(SCRYPT_COST),
    String(SCRYPT_BLOCK_SIZE),
    String(SCRYPT_PARALLELIZATION),
    salt.toString("base64url"),
    derivedKey.toString("base64url")
  ].join("$");
}

export async function verifyProjectAccessPassword(password: string, passwordHash: string) {
  const encodedPassword = passwordBytes(password);
  const [scheme, version, cost, blockSize, parallelization, saltValue, keyValue, ...extra] =
    passwordHash.split("$");

  if (
    !encodedPassword ||
    scheme !== PASSWORD_HASH_SCHEME ||
    version !== PASSWORD_HASH_VERSION ||
    cost !== String(SCRYPT_COST) ||
    blockSize !== String(SCRYPT_BLOCK_SIZE) ||
    parallelization !== String(SCRYPT_PARALLELIZATION) ||
    !saltValue ||
    !keyValue ||
    extra.length > 0
  ) {
    return false;
  }

  const salt = decodeBase64Url(saltValue, SCRYPT_SALT_BYTES);
  const expectedKey = decodeBase64Url(keyValue, SCRYPT_KEY_BYTES);

  if (!salt || !expectedKey) {
    return false;
  }

  try {
    const actualKey = await deriveScryptKey(encodedPassword, salt);
    return timingSafeEqual(actualKey, expectedKey);
  } catch {
    return false;
  }
}

export async function getProjectAccessSetting(
  projectSlug: string
): Promise<ProjectAccessSetting | null> {
  if (!isValidProjectSlug(projectSlug)) {
    return null;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("project_page_settings")
    .select("is_public, access_password_hash, access_version")
    .eq("project_slug", projectSlug)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data || !data.is_public || !isValidAccessVersion(data.access_version)) {
    return null;
  }

  return {
    passwordHash: data.access_password_hash,
    accessVersion: data.access_version
  };
}

export function getProjectAccessCookieName(projectSlug: string) {
  if (!isValidProjectSlug(projectSlug)) {
    throw new Error("Project slug is invalid.");
  }

  return `${PROJECT_ACCESS_COOKIE_PREFIX}${projectSlug}`;
}

export function getProjectAccessCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PROJECT_ACCESS_SESSION_MAX_AGE_SECONDS
  };
}

export function createProjectAccessCookieValue(projectSlug: string, accessVersion: number) {
  getProjectAccessCookieName(projectSlug);

  if (!isValidAccessVersion(accessVersion)) {
    throw new Error("Project access version is invalid.");
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + PROJECT_ACCESS_SESSION_MAX_AGE_SECONDS;
  const nonce = crypto.randomBytes(18).toString("base64url");
  const payload = [
    PROJECT_ACCESS_TOKEN_VERSION,
    String(accessVersion),
    String(issuedAt),
    String(expiresAt),
    nonce
  ].join(".");
  const signature = signProjectAccessToken(projectSlug, payload);

  return `${payload}.${signature}`;
}

export function verifyProjectAccessCookieValue(
  cookieValue: string,
  projectSlug: string,
  accessVersion: number
) {
  if (!isValidProjectSlug(projectSlug) || !isValidAccessVersion(accessVersion)) {
    return false;
  }

  const [version, tokenAccessVersion, issuedAtValue, expiresAtValue, nonce, signature, ...extra] =
    cookieValue.split(".");

  if (
    version !== PROJECT_ACCESS_TOKEN_VERSION ||
    !tokenAccessVersion ||
    !issuedAtValue ||
    !expiresAtValue ||
    !/^[A-Za-z0-9_-]{24}$/.test(nonce ?? "") ||
    !/^[A-Za-z0-9_-]{43}$/.test(signature ?? "") ||
    extra.length > 0
  ) {
    return false;
  }

  const parsedAccessVersion = Number(tokenAccessVersion);
  const issuedAt = Number(issuedAtValue);
  const expiresAt = Number(expiresAtValue);
  const now = Math.floor(Date.now() / 1000);

  if (
    !isValidAccessVersion(parsedAccessVersion) ||
    String(parsedAccessVersion) !== tokenAccessVersion ||
    parsedAccessVersion !== accessVersion ||
    !Number.isSafeInteger(issuedAt) ||
    String(issuedAt) !== issuedAtValue ||
    !Number.isSafeInteger(expiresAt) ||
    String(expiresAt) !== expiresAtValue ||
    issuedAt > now + 60 ||
    expiresAt - issuedAt !== PROJECT_ACCESS_SESSION_MAX_AGE_SECONDS ||
    now >= expiresAt
  ) {
    return false;
  }

  const payload = [version, tokenAccessVersion, issuedAtValue, expiresAtValue, nonce].join(".");

  try {
    const expectedSignature = signProjectAccessToken(projectSlug, payload);
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch {
    return false;
  }
}

export function isProjectAccessAuthorizedFromCookieStore(
  cookieReader: CookieReader,
  projectSlug: string,
  accessVersion: number
) {
  let cookieName = "";

  try {
    cookieName = getProjectAccessCookieName(projectSlug);
  } catch {
    return false;
  }

  return verifyProjectAccessCookieValue(
    readCookieValue(cookieReader, cookieName),
    projectSlug,
    accessVersion
  );
}

export function isProjectAccessAuthorizedFromRequest(
  request: Request,
  projectSlug: string,
  accessVersion: number
) {
  let cookieName = "";

  try {
    cookieName = getProjectAccessCookieName(projectSlug);
  } catch {
    return false;
  }

  return verifyProjectAccessCookieValue(
    readRequestCookie(request, cookieName),
    projectSlug,
    accessVersion
  );
}

export async function isProjectAccessAuthorized(projectSlug: string, accessVersion: number) {
  const cookieStore = await cookies();
  return isProjectAccessAuthorizedFromCookieStore(cookieStore, projectSlug, accessVersion);
}
