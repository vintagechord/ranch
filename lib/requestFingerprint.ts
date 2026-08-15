import "server-only";

import crypto from "node:crypto";

function getFingerprintSecret() {
  const secret = process.env.PROPOSAL_RATE_LIMIT_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!secret) {
    throw new Error("Request fingerprint secret is not configured.");
  }

  return secret;
}

function getClientAddress(request: Request) {
  return (
    request.headers.get("x-vercel-forwarded-for")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.trim() ||
    "unknown"
  ).slice(0, 200);
}

export function createRequestFingerprint(request: Request, scope: string) {
  return crypto
    .createHmac("sha256", getFingerprintSecret())
    .update(`${scope}\0${getClientAddress(request)}`)
    .digest("hex");
}

export function createValueFingerprint(scope: string, value: string) {
  if (!/^[a-z0-9-]{1,64}$/.test(scope)) {
    throw new Error("Value fingerprint scope is invalid.");
  }

  return crypto
    .createHmac("sha256", getFingerprintSecret())
    .update(`value-fingerprint\0${scope}\0${value}`)
    .digest("hex");
}

export function createScopedPayloadHash(scope: string, payload: Record<string, unknown>) {
  if (!/^[a-z0-9-]{1,64}$/.test(scope)) {
    throw new Error("Payload hash scope is invalid.");
  }

  return crypto
    .createHmac("sha256", getFingerprintSecret())
    .update(`${scope}-payload\0${JSON.stringify(payload)}`)
    .digest("hex");
}

export function createPayloadHash(payload: Record<string, unknown>) {
  return createScopedPayloadHash("project-proposal", payload);
}
