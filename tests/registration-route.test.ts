import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

const requestRegistrationVerification = vi.hoisted(() => vi.fn());
const requestRegistrationReplacement = vi.hoisted(() => vi.fn());
const provisionRegisteredClinic = vi.hoisted(() => vi.fn());
const recoverAndProvisionRegisteredClinic = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/request-registration", () => ({
  requestRegistrationVerification,
  requestRegistrationReplacement,
}));

vi.mock("@/lib/auth/provision-registration-clinic", () => ({
  provisionRegisteredClinic,
  recoverAndProvisionRegisteredClinic,
}));

vi.mock("@/lib/tenancy/root-domain", () => ({
  getRootDomain: () => "localhost",
}));

import { POST as register } from "@/app/api/auth/register/route";
import { POST as resend } from "@/app/api/auth/register/resend/route";
import { POST as recoverSlug } from "@/app/api/auth/register/slug/route";
import { POST as verify } from "@/app/api/auth/register/verify/route";
import { REGISTRATION_INTENT_GENERIC_MESSAGE } from "@/lib/auth/registration-copy";
import { TURNSTILE_DUMMY_PASS_TOKEN } from "@/lib/marketing/contact-turnstile-public";

function jsonRequest(path: string, body: unknown, host = "app.localhost:3000") {
  return new Request(`http://${host}${path}`, {
    method: "POST",
    headers: {
      host,
      origin: `http://${host}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

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
    provisionRegisteredClinic.mockReset();
    recoverAndProvisionRegisteredClinic.mockReset();
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

    const verifyDisabled = await verify(
      jsonRequest("/api/auth/register/verify", {
        token: "raw-token-value",
        turnstileToken: TURNSTILE_DUMMY_PASS_TOKEN,
      })
    );
    expect(verifyDisabled.status).toBe(404);
    expect(provisionRegisteredClinic).not.toHaveBeenCalled();

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

    const direct = await verify(
      jsonRequest("/api/auth/register/verify", { token: "raw-token-value" })
    );
    expect(direct.status).toBe(400);
    await expect(direct.json()).resolves.toMatchObject({
      status: "verification_failed",
    });
    expect(provisionRegisteredClinic).not.toHaveBeenCalled();
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

  it("provisions a clinic and sets the session cookie without returning the token", async () => {
    provisionRegisteredClinic.mockResolvedValueOnce({
      status: "provisioned",
      redirectTo: "/account/billing/setup",
      session: {
        sessionToken: "session-token-value",
        expires: new Date("2026-12-19T00:00:00.000Z"),
      },
      intentId: "intent",
      clinicId: "clinic",
      userId: "user",
      commercialPlan: "ESSENTIAL",
      billingInterval: "MONTHLY",
    });
    const valid = await verify(
      new Request("http://app.localhost:3000/api/auth/register/verify", {
        method: "POST",
        headers: {
          host: "app.localhost:3000",
          origin: "http://app.localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          token: "raw-token-value",
          turnstileToken: TURNSTILE_DUMMY_PASS_TOKEN,
        }),
      })
    );
    const validBody = await valid.json();
    expect(validBody).toEqual({
      status: "provisioned",
      redirectTo: "/account/billing/setup",
    });
    expect(JSON.stringify(validBody)).not.toContain("raw-token-value");
    expect(JSON.stringify(validBody)).not.toContain("session-token-value");
    expect(valid.cookies.get("authjs.session-token")?.value).toBe(
      "session-token-value"
    );
    expect(provisionRegisteredClinic).toHaveBeenCalledWith({
      rawToken: "raw-token-value",
    });

    provisionRegisteredClinic.mockResolvedValueOnce({ status: "expired" });
    const expired = await verify(
      new Request("http://app.localhost:3000/api/auth/register/verify", {
        method: "POST",
        headers: {
          host: "app.localhost:3000",
          origin: "http://app.localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          token: "expired-token",
          turnstileToken: TURNSTILE_DUMMY_PASS_TOKEN,
        }),
      })
    );
    await expect(expired.json()).resolves.toMatchObject({ status: "expired" });
    expect(expired.cookies.get("authjs.session-token")).toBeUndefined();
  });

  it("returns a slug recovery response without a session", async () => {
    recoverAndProvisionRegisteredClinic.mockResolvedValueOnce({
      status: "slug_unavailable",
      message: "That tenant slug is already in use.",
      slug: "taken-slug",
    });
    const response = await recoverSlug(
      new Request("http://app.localhost:3000/api/auth/register/slug", {
        method: "POST",
        headers: {
          host: "app.localhost:3000",
          origin: "http://app.localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          token: "raw-token-value",
          slug: "taken-slug",
          turnstileToken: TURNSTILE_DUMMY_PASS_TOKEN,
        }),
      })
    );
    await expect(response.json()).resolves.toEqual({
      status: "slug_unavailable",
      message: "That tenant slug is already in use.",
      slug: "taken-slug",
    });
    expect(response.cookies.get("authjs.session-token")).toBeUndefined();
    expect(recoverAndProvisionRegisteredClinic).toHaveBeenCalledWith({
      rawToken: "raw-token-value",
      slug: "taken-slug",
    });
  });

  it("does not provision from the registration or replacement routes", () => {
    const collected = [
      "app/api/auth/register/route.ts",
      "app/api/auth/register/resend/route.ts",
      "lib/auth/request-registration.ts",
    ]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(collected).not.toContain("consumeRegistrationIntent");
    expect(collected).not.toContain("provisionRegisteredClinic");

    const provisioning = [
      "app/api/auth/register/verify/route.ts",
      "app/api/auth/register/slug/route.ts",
      "lib/auth/provision-registration-clinic.ts",
    ]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(provisioning).not.toContain("createClinicCheckout");
    expect(provisioning).not.toContain("checkout.sessions");
    expect(provisioning).not.toContain("grantComplimentary");
    expect(provisioning).not.toContain("ClinicPromotionalOffer");
    expect(provisioning).toContain("prepareClinicCommercialOffer");
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
