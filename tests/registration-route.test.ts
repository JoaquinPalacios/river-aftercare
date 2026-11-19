import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

const requestRegistrationVerification = vi.hoisted(() => vi.fn());
const requestRegistrationReplacement = vi.hoisted(() => vi.fn());
const validateRegistrationIntent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/request-registration", () => ({
  requestRegistrationVerification,
  requestRegistrationReplacement,
}));

vi.mock("@/lib/auth/registration-intent-service", () => ({
  validateRegistrationIntent,
}));

vi.mock("@/lib/tenancy/root-domain", () => ({
  getRootDomain: () => "localhost",
}));

import { POST as register } from "@/app/api/auth/register/route";
import { POST as resend } from "@/app/api/auth/register/resend/route";
import { POST as verify } from "@/app/api/auth/register/verify/route";
import { REGISTRATION_INTENT_GENERIC_MESSAGE } from "@/lib/auth/registration-copy";
import { TURNSTILE_DUMMY_PASS_TOKEN } from "@/lib/marketing/contact-turnstile-public";

function formRequest(
  path: string,
  fields: Record<string, string>,
  host = "app.localhost:3000"
) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }
  return new Request(`http://${host}${path}`, {
    method: "POST",
    headers: { host, origin: `http://${host}` },
    body: form,
  });
}

const validFields = {
  practiceName: "River Practice",
  slug: "regroute-clinic",
  ownerName: "River Owner",
  email: "regroute-owner@example.test",
  password: "registration-secret-1",
  confirmPassword: "registration-secret-1",
  commercialPlan: "ESSENTIAL",
  billingInterval: "MONTHLY",
  termsAccepted: "on",
  "cf-turnstile-response": TURNSTILE_DUMMY_PASS_TOKEN,
};

describe("registration routes", () => {
  beforeEach(() => {
    process.env.REGISTRATION_ENABLED = "true";
    requestRegistrationVerification.mockReset();
    requestRegistrationReplacement.mockReset();
    validateRegistrationIntent.mockReset();
    requestRegistrationVerification.mockResolvedValue({
      status: "accepted",
      message: REGISTRATION_INTENT_GENERIC_MESSAGE,
    });
    requestRegistrationReplacement.mockResolvedValue({
      status: "accepted",
      message: REGISTRATION_INTENT_GENERIC_MESSAGE,
    });
  });

  it("returns 404 when registration is disabled or the host is not staff", async () => {
    process.env.REGISTRATION_ENABLED = "false";
    const disabled = await register(
      formRequest("/api/auth/register", validFields)
    );
    expect(disabled.status).toBe(404);
    expect(requestRegistrationVerification).not.toHaveBeenCalled();

    process.env.REGISTRATION_ENABLED = "true";
    const marketing = await register(
      formRequest("/api/auth/register", validFields, "localhost:3000")
    );
    expect(marketing.status).toBe(404);
    expect(requestRegistrationVerification).not.toHaveBeenCalled();
  });

  it("does not create an intent for a honeypot or a missing verification token", async () => {
    const honeypot = await register(
      formRequest("/api/auth/register", { ...validFields, website: "spam" })
    );
    expect(honeypot.status).toBe(200);
    await expect(honeypot.json()).resolves.toEqual({
      message: REGISTRATION_INTENT_GENERIC_MESSAGE,
    });

    const { ["cf-turnstile-response"]: _token, ...withoutTurnstile } =
      validFields;
    const unverified = await register(
      formRequest("/api/auth/register", withoutTurnstile)
    );
    expect(unverified.status).toBe(400);
    expect(requestRegistrationVerification).not.toHaveBeenCalled();
  });

  it("returns the generic message and no token", async () => {
    const response = await register(
      formRequest("/api/auth/register", validFields)
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ message: REGISTRATION_INTENT_GENERIC_MESSAGE });
    expect(JSON.stringify(body)).not.toMatch(/token|password|scrypt/i);
    expect(requestRegistrationVerification).toHaveBeenCalledOnce();
  });

  it("validates a token without consuming it and keeps expired links distinct", async () => {
    validateRegistrationIntent.mockResolvedValueOnce({
      ok: true,
      intent: { id: "intent" },
    });
    const valid = await verify(
      new Request("http://app.localhost:3000/api/auth/register/verify", {
        method: "POST",
        headers: {
          host: "app.localhost:3000",
          origin: "http://app.localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ token: "raw-token-value" }),
      })
    );
    const validBody = await valid.json();
    expect(validBody.status).toBe("valid");
    expect(JSON.stringify(validBody)).not.toContain("raw-token-value");
    expect(validateRegistrationIntent).toHaveBeenCalledWith({
      rawToken: "raw-token-value",
    });

    validateRegistrationIntent.mockResolvedValueOnce({
      ok: false,
      reason: "expired",
    });
    const expired = await verify(
      new Request("http://app.localhost:3000/api/auth/register/verify", {
        method: "POST",
        headers: {
          host: "app.localhost:3000",
          origin: "http://app.localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ token: "expired-token" }),
      })
    );
    await expect(expired.json()).resolves.toMatchObject({ status: "expired" });
  });

  it("does not consume a registration intent from the public routes", () => {
    const source = [
      "app/api/auth/register/route.ts",
      "app/api/auth/register/resend/route.ts",
      "app/api/auth/register/verify/route.ts",
      "lib/auth/request-registration.ts",
    ]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(source).not.toContain("consumeRegistrationIntent");
  });

  it("sends a replacement request without returning a token", async () => {
    const response = await resend(
      formRequest("/api/auth/register/resend", {
        email: "regroute-owner@example.test",
        "cf-turnstile-response": TURNSTILE_DUMMY_PASS_TOKEN,
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ message: REGISTRATION_INTENT_GENERIC_MESSAGE });
    expect(JSON.stringify(body)).not.toMatch(/token|password/i);
  });
});
