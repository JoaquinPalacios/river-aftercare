import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { NEW_PASSWORD_MIN_MESSAGE } from "@/lib/auth/password-policy";
import {
  REGISTRATION_INTENT_GENERIC_MESSAGE,
  REGISTRATION_INTENT_TTL_MS,
  REGISTRATION_PLAN_MESSAGE,
  REGISTRATION_SLUG_DEMO_MESSAGE,
  REGISTRATION_SLUG_RESERVED_MESSAGE,
  registrationConsumePublicOutcome,
  registrationIntentExpiresAt,
  registrationTokenFailure,
} from "@/lib/auth/registration-intent";
import { createOrReplaceRegistrationIntent } from "@/lib/auth/registration-intent-service";

const serviceSource = readFileSync(
  path.join(process.cwd(), "lib/auth/registration-intent-service.ts"),
  "utf8"
);
const pureSource = readFileSync(
  path.join(process.cwd(), "lib/auth/registration-intent.ts"),
  "utf8"
);

describe("registration intent policy", () => {
  it("expires exactly 24 hours after the supplied instant", () => {
    const now = new Date("2026-11-19T03:04:05.000Z");
    expect(registrationIntentExpiresAt(now).toISOString()).toBe(
      "2026-11-20T03:04:05.000Z"
    );
    expect(REGISTRATION_INTENT_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("treats the verification instant as expired and a revoked row as revoked", () => {
    const expiresAt = new Date("2026-11-20T00:00:00.000Z");
    expect(
      registrationTokenFailure(
        { revokedAt: null, consumedAt: null, expiresAt },
        new Date(expiresAt.getTime() - 1)
      )
    ).toBeNull();
    expect(
      registrationTokenFailure(
        { revokedAt: null, consumedAt: null, expiresAt },
        expiresAt
      )
    ).toBe("expired");
    expect(
      registrationTokenFailure(
        {
          revokedAt: expiresAt,
          consumedAt: null,
          expiresAt,
        },
        new Date("2026-11-19T00:00:00.000Z")
      )
    ).toBe("revoked");
  });

  it("collapses account and token failures to one public outcome", () => {
    expect(registrationConsumePublicOutcome("missing")).toBe("invalid");
    expect(registrationConsumePublicOutcome("expired")).toBe("invalid");
    expect(registrationConsumePublicOutcome("consumed")).toBe("invalid");
    expect(registrationConsumePublicOutcome("revoked")).toBe("invalid");
    expect(registrationConsumePublicOutcome("account_exists")).toBe("invalid");
    expect(registrationConsumePublicOutcome("slug_unavailable")).toBe(
      "slug_unavailable"
    );
  });

  it("rejects reserved hosts, the demo, Group, and a short password before any database write", async () => {
    const reserved = await createOrReplaceRegistrationIntent({
      ...validInput(),
      slug: "app",
    });
    expect(reserved).toMatchObject({
      status: "invalid",
      field: "slug",
      message: REGISTRATION_SLUG_RESERVED_MESSAGE,
    });

    const demo = await createOrReplaceRegistrationIntent({
      ...validInput(),
      slug: "demo",
    });
    expect(demo).toMatchObject({
      status: "invalid",
      field: "slug",
      message: REGISTRATION_SLUG_DEMO_MESSAGE,
    });

    const demoClinic = await createOrReplaceRegistrationIntent({
      ...validInput(),
      slug: "demodental",
    });
    expect(demoClinic).toMatchObject({
      status: "invalid",
      field: "slug",
      message: REGISTRATION_SLUG_DEMO_MESSAGE,
    });

    const group = await createOrReplaceRegistrationIntent({
      ...validInput(),
      commercialPlan: "GROUP",
    });
    expect(group).toMatchObject({
      status: "invalid",
      field: "commercialPlan",
      message: REGISTRATION_PLAN_MESSAGE,
    });

    const password = await createOrReplaceRegistrationIntent({
      ...validInput(),
      password: "short",
    });
    expect(password).toMatchObject({
      status: "invalid",
      field: "password",
      message: NEW_PASSWORD_MIN_MESSAGE,
    });
  });

  it("does not mention Stripe, mail delivery, or clinic and user creation", () => {
    const combined = `${serviceSource}\n${pureSource}`;
    expect(combined.toLowerCase()).not.toContain("stripe");
    expect(combined).not.toContain("clinic.create");
    expect(combined).not.toContain("user.create");
    expect(combined).not.toContain("sendAuthTransactionalEmail");
    expect(serviceSource).not.toContain(
      "If that address can be registered, we've sent a verification link."
    );
  });
});

function validInput() {
  return {
    email: "regint-policy@example.test",
    password: "registration-secret-1",
    ownerName: "River Owner",
    practiceName: "River Practice",
    slug: "regint-policy",
    serviceCategories: ["DENTAL"],
    commercialPlan: "ESSENTIAL",
    billingInterval: "MONTHLY",
  };
}
