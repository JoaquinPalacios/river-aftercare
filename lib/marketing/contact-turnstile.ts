import { isVercelProduction } from "@/lib/runtime/vercel-production";
import {
  CONTACT_TURNSTILE_TOKEN_MAX_LENGTH,
  TURNSTILE_DUMMY_PASS_SITE_KEY,
} from "@/lib/marketing/contact-turnstile-public";

export const TURNSTILE_SECRET_KEY_ENV = "TURNSTILE_SECRET_KEY";
export const TURNSTILE_SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_VERIFY_TIMEOUT_MS = 4000;

/** Cloudflare dummy secrets. Server-only. Never import from Client Components. */
export const TURNSTILE_DUMMY_PASS_SECRET =
  "1x0000000000000000000000000000000AA";
export const TURNSTILE_DUMMY_FAIL_SECRET =
  "2x0000000000000000000000000000000AA";
export const TURNSTILE_DUMMY_SPENT_SECRET =
  "3x0000000000000000000000000000000AA";

type Env = Record<string, string | undefined>;

export type TurnstileVerifyReason =
  "missing" | "failed" | "expired" | "unavailable";

export type TurnstileVerifyResult =
  { ok: true } | { ok: false; reason: TurnstileVerifyReason };

export function getTurnstileSecretKey(env: Env = process.env): string | null {
  const configured = env[TURNSTILE_SECRET_KEY_ENV]?.trim() ?? "";
  if (configured) {
    return configured;
  }

  if (isVercelProduction(env)) {
    return null;
  }

  const siteKey = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";
  if (!siteKey || siteKey === TURNSTILE_DUMMY_PASS_SITE_KEY) {
    return TURNSTILE_DUMMY_PASS_SECRET;
  }

  return null;
}

export function vercelRequestIp(requestHeaders: Headers): string | undefined {
  if (process.env.VERCEL !== "1") {
    return undefined;
  }

  const forwarded = requestHeaders.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (!first || first.length > 64 || /[\s,]/.test(first)) {
    return undefined;
  }

  return first;
}

function dummySecretResult(secret: string): TurnstileVerifyResult | null {
  if (secret === TURNSTILE_DUMMY_PASS_SECRET) {
    return { ok: true };
  }
  if (secret === TURNSTILE_DUMMY_FAIL_SECRET) {
    return { ok: false, reason: "failed" };
  }
  if (secret === TURNSTILE_DUMMY_SPENT_SECRET) {
    return { ok: false, reason: "expired" };
  }
  return null;
}

function codesFromPayload(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const codes = (payload as { "error-codes"?: unknown })["error-codes"];
  if (!Array.isArray(codes)) {
    return [];
  }

  return codes.filter((code): code is string => typeof code === "string");
}

export async function verifyTurnstileToken({
  token,
  secret,
  remoteIp,
  fetchImpl = fetch,
  timeoutMs = TURNSTILE_VERIFY_TIMEOUT_MS,
  env = process.env,
}: {
  token: string;
  secret: string | null;
  remoteIp?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  env?: Env;
}): Promise<TurnstileVerifyResult> {
  if (!secret) {
    return { ok: false, reason: "unavailable" };
  }

  if (!token) {
    return { ok: false, reason: "missing" };
  }

  if (token.length > CONTACT_TURNSTILE_TOKEN_MAX_LENGTH) {
    return { ok: false, reason: "failed" };
  }

  if (!isVercelProduction(env)) {
    const dummy = dummySecretResult(secret);
    if (dummy) {
      return dummy;
    }
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (remoteIp) {
    body.set("remoteip", remoteIp);
  }

  try {
    const response = await fetchImpl(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      return { ok: false, reason: "unavailable" };
    }

    const payload: unknown = await response.json();
    if (
      payload &&
      typeof payload === "object" &&
      (payload as { success?: unknown }).success === true
    ) {
      return { ok: true };
    }

    const codes = codesFromPayload(payload);
    if (codes.includes("timeout-or-duplicate")) {
      return { ok: false, reason: "expired" };
    }

    return { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
