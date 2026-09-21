import { afterEach, describe, expect, it, vi } from "vitest";

const sentryState = vi.hoisted(() => ({
  captureEvent: vi.fn(),
  captureException: vi.fn(),
}));

const sendAuthMock = vi.hoisted(() => vi.fn());
const getConfigMock = vi.hoisted(() => vi.fn());
const findUniqueMock = vi.hoisted(() => vi.fn());
const createIfAllowedMock = vi.hoisted(() => vi.fn());
const revokeMock = vi.hoisted(() => vi.fn());

vi.mock("@sentry/nextjs", () => ({
  captureEvent: sentryState.captureEvent,
  captureException: sentryState.captureException,
  captureRequestError: vi.fn(),
  init: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    user: { findUnique: findUniqueMock },
  }),
}));

vi.mock("@/lib/auth/account-token-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/auth/account-token-service")>();
  return {
    ...actual,
    createPasswordResetTokenIfAllowed: createIfAllowedMock,
    revokeAccountToken: revokeMock,
  };
});

vi.mock("@/lib/email/auth-email", () => ({
  getAuthEmailDeliveryConfig: getConfigMock,
  sendAuthTransactionalEmail: sendAuthMock,
}));

vi.mock("@/lib/auth/password-lifecycle-log", () => ({
  logPasswordLifecycle: vi.fn(),
}));

vi.mock("@/lib/auth/invitation-lifecycle-log", () => ({
  logInvitationLifecycle: vi.fn(),
}));

vi.mock("@/lib/tenancy/root-domain", () => ({
  getRootDomain: () => "example.test",
}));

const resendState = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class Resend {
    emails = { send: resendState.send };
  },
}));

import { requestPasswordReset } from "@/lib/auth/request-password-reset";
import {
  CONTACT_DELIVERY_FAILED,
  deliverMarketingContactEnquiry,
} from "@/lib/marketing/contact-mailer";
import { CONTACT_HONEYPOT_FIELD } from "@/lib/marketing/contact-enquiry";
import { deliverClinicInvitationEmail } from "@/lib/operator/deliver-clinic-invitation-email";

const FAKE_DSN = "https://examplePublicKey@o0.ingest.example.test/0";

const enquiry = {
  fullName: "Alex Rivera",
  workEmail: "alex@clinic.example.test",
  clinicName: "Harbour Dental",
  phone: "0400 000 000",
  message: "We have two rooms.",
  [CONTACT_HONEYPOT_FIELD]: "",
};

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function enableTracking() {
  process.env.VERCEL_ENV = "production";
  process.env.NEXT_PUBLIC_SENTRY_DSN = FAKE_DSN;
}

describe("operational failure reporting", () => {
  const previous = {
    vercelEnv: process.env.VERCEL_ENV,
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    to: process.env.CONTACT_EMAIL_TO,
    from: process.env.CONTACT_EMAIL_FROM,
    mailer: process.env.CONTACT_MAILER,
    resend: process.env.RESEND_API_KEY,
    root: process.env.CARE_GUIDE_ROOT_DOMAIN,
  };

  afterEach(() => {
    restore("VERCEL_ENV", previous.vercelEnv);
    restore("NEXT_PUBLIC_SENTRY_DSN", previous.dsn);
    restore("CONTACT_EMAIL_TO", previous.to);
    restore("CONTACT_EMAIL_FROM", previous.from);
    restore("CONTACT_MAILER", previous.mailer);
    restore("RESEND_API_KEY", previous.resend);
    restore("CARE_GUIDE_ROOT_DOMAIN", previous.root);
    sentryState.captureEvent.mockReset();
    sentryState.captureException.mockReset();
    sendAuthMock.mockReset();
    getConfigMock.mockReset();
    findUniqueMock.mockReset();
    createIfAllowedMock.mockReset();
    revokeMock.mockReset();
    resendState.send.mockReset();
  });

  it("reports exactly one sanitized contact delivery failure", async () => {
    enableTracking();
    process.env.CONTACT_EMAIL_TO = "hello@example.test";
    process.env.CONTACT_EMAIL_FROM = "website@example.test";
    process.env.CONTACT_MAILER = "resend";
    process.env.RESEND_API_KEY = "re_test_key";
    resendState.send.mockResolvedValue({
      data: null,
      error: { message: "rate limited by resend", id: "msg_hidden" },
    });

    const result = await deliverMarketingContactEnquiry(enquiry);
    expect(result).toEqual({ ok: false, error: CONTACT_DELIVERY_FAILED });
    expect(sentryState.captureEvent).toHaveBeenCalledOnce();
    const event = sentryState.captureEvent.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(event.message).toBe("contact_email_delivery_failed");
    expect(event.tags).toEqual({
      component: "contact-email",
      failure_code: "delivery_failed",
      environment: "production",
    });
    const payload = JSON.stringify(sentryState.captureEvent.mock.calls);
    expect(payload).not.toContain("alex@clinic.example.test");
    expect(payload).not.toContain("hello@example.test");
    expect(payload).not.toContain("We have two rooms.");
    expect(payload).not.toContain("re_test_key");
    expect(payload).not.toContain("msg_hidden");
    expect(payload).not.toContain("rate limited");
  });

  it("does not report a successful contact delivery", async () => {
    enableTracking();
    process.env.CONTACT_EMAIL_TO = "hello@example.test";
    process.env.CONTACT_EMAIL_FROM = "website@example.test";
    process.env.CONTACT_MAILER = "resend";
    process.env.RESEND_API_KEY = "re_test_key";
    resendState.send.mockResolvedValue({
      data: { id: "msg_hidden" },
      error: null,
    });
    const result = await deliverMarketingContactEnquiry(enquiry);
    expect(result).toEqual({ ok: true });
    expect(sentryState.captureEvent).not.toHaveBeenCalled();
  });

  it("reports exactly one sanitized auth mail delivery failure", async () => {
    enableTracking();
    findUniqueMock.mockResolvedValue({
      id: "user_1",
      email: "user@example.test",
      passwordHash: "scrypt:hash",
    });
    getConfigMock.mockReturnValue({
      ready: true,
      from: "River Aftercare <accounts@example.test>",
      replyTo: "hello@example.test",
      transport: { kind: "memory" },
    });
    createIfAllowedMock.mockResolvedValue({
      created: true,
      rawToken: "raw-token-value",
      token: { id: "tok_1" },
    });
    sendAuthMock.mockResolvedValue({ ok: false, code: "delivery_failed" });

    await requestPasswordReset({ email: "user@example.test" });
    expect(sentryState.captureEvent).toHaveBeenCalledOnce();
    const event = sentryState.captureEvent.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(event.message).toBe("auth_email_delivery_failed");
    expect(event.tags).toEqual({
      component: "auth-email",
      failure_code: "delivery_failed",
      environment: "production",
    });
    const payload = JSON.stringify(sentryState.captureEvent.mock.calls);
    expect(payload).not.toContain("user@example.test");
    expect(payload).not.toContain("raw-token-value");
    expect(payload).not.toContain("accounts@example.test");
    expect(payload).not.toContain("user_1");
  });

  it("reports auth_email_not_configured without recipient detail", async () => {
    enableTracking();
    getConfigMock.mockReturnValue({ ready: false, reason: "missing_from" });
    await deliverClinicInvitationEmail({
      to: "invitee@example.test",
      rawToken: "raw-token-value",
      clinicName: "Harbour Dental",
      role: "STAFF",
      inviteeName: "Alex Rivera",
      userId: "user_1",
      clinicId: "clinic_1",
    });
    expect(sentryState.captureEvent).toHaveBeenCalledOnce();
    const event = sentryState.captureEvent.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(event.message).toBe("auth_email_not_configured");
    const payload = JSON.stringify(sentryState.captureEvent.mock.calls);
    expect(payload).not.toContain("invitee@example.test");
    expect(payload).not.toContain("Alex Rivera");
    expect(payload).not.toContain("raw-token-value");
    expect(payload).not.toContain("Harbour Dental");
  });

  it("does not report expected unknown-email password reset", async () => {
    enableTracking();
    findUniqueMock.mockResolvedValue(null);
    await requestPasswordReset({ email: "missing@example.test" });
    expect(sendAuthMock).not.toHaveBeenCalled();
    expect(sentryState.captureEvent).not.toHaveBeenCalled();
  });
});
