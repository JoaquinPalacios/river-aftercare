import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

const processMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/billing/webhook-processor", () => ({
  processVerifiedStripeEvent: processMock,
}));

import { POST } from "@/app/api/stripe/webhook/route";
import { BILLING_TEST_ENV } from "./helpers/billing";

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function signedRequest(
  payload: string,
  secret: string,
  host = "app.localhost:3000"
) {
  const stripe = new Stripe(BILLING_TEST_ENV.STRIPE_SECRET_KEY);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
  });
  return new Request("http://app.localhost:3000/api/stripe/webhook", {
    method: "POST",
    headers: {
      host,
      "stripe-signature": signature,
      "content-type": "application/json",
    },
    body: payload,
  });
}

function eventPayload(type: string, object: Record<string, unknown>) {
  return JSON.stringify({
    id: "evt_test_webhook_1",
    object: "event",
    api_version: Stripe.API_VERSION,
    created: 1_747_000_000,
    type,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object },
  });
}

describe("POST /api/stripe/webhook", () => {
  const previous: Record<string, string | undefined> = {};

  beforeEach(() => {
    processMock.mockReset();
    processMock.mockResolvedValue({
      outcome: "processed",
      clinicId: "clinic_1",
      stripeEventId: "evt_test_webhook_1",
      eventType: "invoice.paid",
    });
    for (const [name, value] of Object.entries({
      CARE_GUIDE_ROOT_DOMAIN: "localhost",
      ...BILLING_TEST_ENV,
    })) {
      previous[name] = process.env[name];
      process.env[name] = value;
    }
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(previous)) {
      restore(name, value);
    }
  });

  it("accepts a valid Stripe signature on the staff host", async () => {
    const payload = eventPayload("invoice.paid", {
      object: "invoice",
      id: "in_1",
      status: "paid",
      customer: "cus_1",
    });
    const response = await POST(
      signedRequest(payload, BILLING_TEST_ENV.STRIPE_WEBHOOK_SECRET)
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(processMock).toHaveBeenCalledOnce();
  });

  it("rejects an invalid signature", async () => {
    const payload = eventPayload("invoice.paid", {
      object: "invoice",
      id: "in_1",
      status: "paid",
    });
    const response = await POST(signedRequest(payload, "whsec_other_secret"));
    expect(response.status).toBe(400);
    expect(processMock).not.toHaveBeenCalled();
    const body = await response.text();
    expect(body.toLowerCase()).not.toContain("sk_test");
    expect(body.toLowerCase()).not.toContain("whsec_");
  });

  it("rejects a missing signature", async () => {
    const response = await POST(
      new Request("http://app.localhost:3000/api/stripe/webhook", {
        method: "POST",
        headers: {
          host: "app.localhost:3000",
          "content-type": "application/json",
        },
        body: eventPayload("invoice.paid", { object: "invoice", id: "in_1" }),
      })
    );
    expect(response.status).toBe(400);
    expect(processMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed empty payload", async () => {
    const response = await POST(
      signedRequest("", BILLING_TEST_ENV.STRIPE_WEBHOOK_SECRET)
    );
    expect(response.status).toBe(400);
    expect(processMock).not.toHaveBeenCalled();
  });

  it("returns 404 off the staff host without processing", async () => {
    const payload = eventPayload("invoice.paid", {
      object: "invoice",
      id: "in_1",
      status: "paid",
    });
    const marketing = await POST(
      signedRequest(
        payload,
        BILLING_TEST_ENV.STRIPE_WEBHOOK_SECRET,
        "localhost:3000"
      )
    );
    expect(marketing.status).toBe(404);
    expect(processMock).not.toHaveBeenCalled();
  });

  it("fails clearly when Stripe is not configured", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_SECRET_KEY;
    const payload = eventPayload("invoice.paid", {
      object: "invoice",
      id: "in_1",
    });
    const response = await POST(
      new Request("http://app.localhost:3000/api/stripe/webhook", {
        method: "POST",
        headers: {
          host: "app.localhost:3000",
          "stripe-signature": "t=1,v1=abc",
        },
        body: payload,
      })
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Stripe webhook is not configured.",
    });
    expect(processMock).not.toHaveBeenCalled();
  });

  it("refuses live Stripe secrets", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_should_never_be_used";
    const payload = eventPayload("invoice.paid", {
      object: "invoice",
      id: "in_1",
    });
    const response = await POST(
      new Request("http://app.localhost:3000/api/stripe/webhook", {
        method: "POST",
        headers: {
          host: "app.localhost:3000",
          "stripe-signature": "t=1,v1=abc",
        },
        body: payload,
      })
    );
    expect(response.status).toBe(500);
    expect(processMock).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("sk_live_should_never_be_used");
  });

  it("returns 500 without leaking internals when processing throws", async () => {
    processMock.mockRejectedValue(new Error("db exploded sk_test_secret"));
    const payload = eventPayload("invoice.paid", {
      object: "invoice",
      id: "in_1",
      status: "paid",
    });
    const response = await POST(
      signedRequest(payload, BILLING_TEST_ENV.STRIPE_WEBHOOK_SECRET)
    );
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toContain("Stripe webhook could not be processed.");
    expect(body).not.toContain("db exploded");
    expect(body).not.toContain("sk_test_secret");
  });
});
