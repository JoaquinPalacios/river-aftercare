import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getTurnstileSecretKey,
  TURNSTILE_DUMMY_FAIL_SECRET,
  TURNSTILE_DUMMY_PASS_SECRET,
  TURNSTILE_DUMMY_SPENT_SECRET,
  TURNSTILE_SITEVERIFY_URL,
  vercelRequestIp,
  verifyTurnstileToken,
} from "@/lib/marketing/contact-turnstile";
import { TURNSTILE_DUMMY_PASS_SITE_KEY } from "@/lib/marketing/contact-turnstile-public";

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("verifyTurnstileToken", () => {
  afterEach(() => {
    restore("VERCEL_ENV", undefined);
    restore("VERCEL", undefined);
    restore("TURNSTILE_SECRET_KEY", undefined);
    restore("NEXT_PUBLIC_TURNSTILE_SITE_KEY", undefined);
  });

  it("rejects a missing token without calling Siteverify", async () => {
    const fetchImpl = vi.fn();
    const result = await verifyTurnstileToken({
      token: "",
      secret: "real-secret",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: false, reason: "missing" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed when the secret is missing", async () => {
    const fetchImpl = vi.fn();
    const result = await verifyTurnstileToken({
      token: "token",
      secret: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: false, reason: "unavailable" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("accepts Cloudflare dummy pass secrets without network outside Vercel production", async () => {
    const fetchImpl = vi.fn();
    const result = await verifyTurnstileToken({
      token: "any-token",
      secret: TURNSTILE_DUMMY_PASS_SECRET,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects dummy fail and spent secrets without network outside Vercel production", async () => {
    const fetchImpl = vi.fn();
    await expect(
      verifyTurnstileToken({
        token: "token",
        secret: TURNSTILE_DUMMY_FAIL_SECRET,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).resolves.toEqual({ ok: false, reason: "failed" });
    await expect(
      verifyTurnstileToken({
        token: "token",
        secret: TURNSTILE_DUMMY_SPENT_SECRET,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).resolves.toEqual({ ok: false, reason: "expired" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("always calls Siteverify in Vercel production, including dummy secrets", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    const result = await verifyTurnstileToken({
      token: "prod-token",
      secret: TURNSTILE_DUMMY_PASS_SECRET,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: { VERCEL_ENV: "production" },
    });
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(TURNSTILE_SITEVERIFY_URL);
    expect(init.method).toBe("POST");
    expect(String(init.body)).toContain("response=prod-token");
    expect(String(init.body)).not.toContain("TURNSTILE_SECRET_KEY");
  });

  it("treats a successful Siteverify payload as accepted", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    await expect(
      verifyTurnstileToken({
        token: "live-token",
        secret: "live-secret",
        remoteIp: "203.0.113.10",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).resolves.toEqual({ ok: true });
    expect(String(fetchImpl.mock.calls[0]?.[1]?.body)).toContain(
      "remoteip=203.0.113.10"
    );
  });

  it("rejects invalid Siteverify success=false without exposing codes", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: false,
        "error-codes": ["invalid-input-response"],
      }),
    });
    await expect(
      verifyTurnstileToken({
        token: "bad-token",
        secret: "live-secret",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).resolves.toEqual({ ok: false, reason: "failed" });
  });

  it("maps timeout-or-duplicate to expired", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: false,
        "error-codes": ["timeout-or-duplicate"],
      }),
    });
    await expect(
      verifyTurnstileToken({
        token: "spent-token",
        secret: "live-secret",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).resolves.toEqual({ ok: false, reason: "expired" });
  });

  it("fails closed when Siteverify is unavailable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ success: false }),
    });
    await expect(
      verifyTurnstileToken({
        token: "token",
        secret: "live-secret",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("fails closed when Siteverify times out or throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("timeout"));
    await expect(
      verifyTurnstileToken({
        token: "token",
        secret: "live-secret",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("sends an abort signal so Siteverify cannot hang the action", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    await verifyTurnstileToken({
      token: "token",
      secret: "live-secret",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 1234,
    });
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("Turnstile configuration", () => {
  afterEach(() => {
    restore("VERCEL_ENV", undefined);
    restore("VERCEL", undefined);
    restore("TURNSTILE_SECRET_KEY", undefined);
    restore("NEXT_PUBLIC_TURNSTILE_SITE_KEY", undefined);
  });

  it("fails closed in Vercel production when the secret is missing", () => {
    expect(
      getTurnstileSecretKey({
        VERCEL_ENV: "production",
      })
    ).toBeNull();
  });

  it("uses the Cloudflare dummy secret only for local dummy sitekeys", () => {
    expect(getTurnstileSecretKey({})).toBe(TURNSTILE_DUMMY_PASS_SECRET);
    expect(
      getTurnstileSecretKey({
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: TURNSTILE_DUMMY_PASS_SITE_KEY,
      })
    ).toBe(TURNSTILE_DUMMY_PASS_SECRET);
    expect(
      getTurnstileSecretKey({
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0x4AAAAAAA-not-dummy",
      })
    ).toBeNull();
  });

  it("only attaches a remote IP on Vercel from the platform forwarded header", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.10, 10.0.0.1",
    });
    process.env.VERCEL = "1";
    expect(vercelRequestIp(headers)).toBe("203.0.113.10");
    delete process.env.VERCEL;
    expect(vercelRequestIp(headers)).toBeUndefined();
  });
});
