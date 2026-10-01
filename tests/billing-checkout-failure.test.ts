import { BillingStatus, EntitlementStatus } from "@prisma/client";
import Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";

import { checkoutReturnUrls } from "@/lib/billing/checkout-origin";
import {
  checkoutFailureMessage,
  createClinicCheckout,
  type CheckoutStripePort,
} from "@/lib/billing/checkout";
import { saveBillingSetup } from "@/lib/billing/save-billing-setup";
import { checkoutFailureLogFields } from "@/lib/billing/stripe-error-log";
import {
  BILLING_TEST_ENV,
  GROUP_BILLING_TEST_ENV,
} from "@/tests/helpers/billing";

const CLINIC_ID = "clinic_riverside";
const USER_ID = "user_admin";
const SECRET = "sk_live_do_not_log";
const CARD = "4242424242424242";
const EMAIL = "accounts@example.com";
const ADDRESS = "10 River Street";
const SUCCESS_URL =
  "https://app.riveraftercare.com.au/account/billing/complete";
const CANCEL_URL =
  "https://app.riveraftercare.com.au/account/billing/setup?checkout=cancelled";

const billingForm = {
  legalEntityName: "Harbour Dental Pty Ltd",
  tradingName: "Riverside Dental Demo",
  billingContactName: "Alex Chen",
  billingEmail: EMAIL,
  addressLine1: ADDRESS,
  addressLine2: "",
  city: "Tweed Heads",
  region: "NSW",
  postalCode: "2486",
  country: "AU",
  businessNumberKind: "abn",
  abn: "32 671 297 130",
  acn: "",
  termsAccepted: true,
};

type StoredProfile = {
  clinicId: string;
  legalEntityName?: string | null;
  billingEmail?: string | null;
  addressLine1?: string | null;
  abn?: string | null;
  acn?: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeCheckoutSessionId: string | null;
};

function memoryBilling(clinicId = CLINIC_ID) {
  const profiles = new Map<string, StoredProfile>();
  const entitlements = new Map<
    string,
    {
      commercialPlan: "ESSENTIAL" | "PRACTICE" | "GROUP";
      billingInterval: "MONTHLY" | "YEARLY";
      billingStatus: BillingStatus;
      entitlementStatus: EntitlementStatus;
      offeredAdditionalSiteQuantity: number | null;
    }
  >();
  entitlements.set(clinicId, {
    commercialPlan: "ESSENTIAL",
    billingInterval: "MONTHLY",
    billingStatus: BillingStatus.OFFER_PREPARED,
    entitlementStatus: EntitlementStatus.PENDING,
    offeredAdditionalSiteQuantity: null,
  });
  const acceptances: Array<Record<string, unknown>> = [];
  let entitlementWrites = 0;

  const db = {
    clinicBillingProfile: {
      async upsert(args: {
        where: { clinicId: string };
        create: StoredProfile;
        update: Partial<StoredProfile>;
      }) {
        const existing = profiles.get(args.where.clinicId);
        if (existing) {
          Object.assign(existing, args.update);
          return existing;
        }
        const created: StoredProfile = {
          ...args.create,
          stripeCustomerId: args.create.stripeCustomerId ?? null,
          stripeSubscriptionId: args.create.stripeSubscriptionId ?? null,
          stripeCheckoutSessionId: args.create.stripeCheckoutSessionId ?? null,
        };
        profiles.set(args.where.clinicId, created);
        return created;
      },
      async findUnique(args: { where: { clinicId: string } }) {
        return profiles.get(args.where.clinicId) ?? null;
      },
      async update(args: {
        where: { clinicId: string };
        data: Partial<StoredProfile>;
      }) {
        const existing = profiles.get(args.where.clinicId);
        if (!existing) {
          throw new Error("missing billing profile");
        }
        Object.assign(existing, args.data);
        return existing;
      },
    },
    clinicEntitlement: {
      async findUnique(args: { where: { clinicId: string } }) {
        return entitlements.get(args.where.clinicId) ?? null;
      },
      async update() {
        entitlementWrites += 1;
        throw new Error("checkout must not update entitlement");
      },
    },
    legalAcceptance: {
      async create(args: { data: Record<string, unknown> }) {
        const row = {
          id: `acceptance_${acceptances.length + 1}`,
          ...args.data,
        };
        acceptances.push(row);
        return row;
      },
      async findFirst(args: { where: Record<string, unknown> }) {
        return (
          acceptances.find((row) =>
            Object.entries(args.where).every(
              ([key, value]) => row[key] === value
            )
          ) ?? null
        );
      },
    },
    async $queryRaw() {
      return [];
    },
    async $transaction(callback: (tx: object) => Promise<unknown>) {
      return callback(db);
    },
  };

  return {
    db,
    profiles,
    entitlements,
    entitlementWrites: () => entitlementWrites,
    setOffer(offer: {
      commercialPlan: "ESSENTIAL" | "PRACTICE" | "GROUP";
      billingInterval: "MONTHLY" | "YEARLY";
      offeredAdditionalSiteQuantity?: number | null;
    }) {
      const current = entitlements.get(clinicId);
      if (!current) {
        throw new Error("missing entitlement");
      }
      entitlements.set(clinicId, {
        ...current,
        commercialPlan: offer.commercialPlan,
        billingInterval: offer.billingInterval,
        offeredAdditionalSiteQuantity:
          offer.offeredAdditionalSiteQuantity ?? null,
      });
    },
  };
}

function stripeApiError(input: { param: string; requestId: string }) {
  return new Stripe.errors.StripeInvalidRequestError({
    message: `No such price. ${SECRET} card ${CARD} ${EMAIL} ${ADDRESS}`,
    type: "invalid_request_error",
    code: "resource_missing",
    param: input.param,
    requestId: input.requestId,
    statusCode: 404,
    headers: { authorization: `Bearer ${SECRET}` },
    payment_method: { card: { number: CARD } },
  } as never);
}

function scriptedStripe() {
  const customers = { created: [] as unknown[], updated: [] as unknown[] };
  const sessions = { created: [] as unknown[], keys: [] as string[] };
  const metadata = new Map<string, Record<string, string>>();
  let fail: "customer_create" | "customer_update" | "session_create" | null =
    null;

  function remember(
    id: string,
    patch: Record<string, string> | undefined
  ): Record<string, string> {
    const next = { ...(metadata.get(id) ?? {}), ...patch };
    metadata.set(id, next);
    return next;
  }

  const port: CheckoutStripePort = {
    customers: {
      async create(params) {
        customers.created.push(params);
        if (fail === "customer_create") {
          throw stripeApiError({
            param: "email",
            requestId: "req_CustomerCreate1",
          });
        }
        return {
          id: "cus_riverside",
          metadata: remember("cus_riverside", params.metadata),
        };
      },
      async update(id, params) {
        customers.updated.push({ id, ...params });
        if (fail === "customer_update") {
          throw stripeApiError({
            param: "customer",
            requestId: "req_CustomerUpdate1",
          });
        }
        return { id, metadata: remember(id, params.metadata) };
      },
    },
    checkout: {
      sessions: {
        async create(params, options) {
          sessions.keys.push(options?.idempotencyKey ?? "");
          if (fail === "session_create") {
            throw stripeApiError({
              param: "line_items[0][price]",
              requestId: "req_SessionCreate1",
            });
          }
          sessions.created.push(params);
          return {
            id: "cs_riverside_1",
            url: "https://checkout.stripe.com/c/pay/cs_riverside_1",
            status: "open",
          };
        },
        async retrieve(id) {
          return {
            id,
            url: "https://checkout.stripe.com/c/pay/cs_riverside_1",
            status: "open",
            line_items: null,
          };
        },
        async expire() {
          return {};
        },
      },
    },
  };
  return {
    port,
    customers,
    sessions,
    fail(next: typeof fail) {
      fail = next;
    },
  };
}

function savedProfile(store: ReturnType<typeof memoryBilling>) {
  const profile = store.profiles.get(CLINIC_ID);
  expect(profile).toBeTruthy();
  return profile!;
}

async function saveDetails(
  store: ReturnType<typeof memoryBilling>,
  form: typeof billingForm = billingForm
) {
  const saved = await saveBillingSetup(
    { clinicId: CLINIC_ID, userId: USER_ID, form },
    store.db as never
  );
  expect(saved.ok).toBe(true);
}

describe("checkout return URLs", () => {
  it("uses the staff host and the first forwarded protocol", () => {
    expect(
      checkoutReturnUrls({
        host: "app.riveraftercare.com.au",
        forwardedProto: "https,http",
      })
    ).toEqual({
      successUrl: SUCCESS_URL,
      cancelUrl: CANCEL_URL,
    });
    expect(
      checkoutReturnUrls({
        host: "app.localhost:3000",
        forwardedProto: null,
      }).successUrl
    ).toBe("http://app.localhost:3000/account/billing/complete");
  });
});

describe("Essential monthly checkout failures", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saves billing details and opens Checkout for Essential monthly", async () => {
    const store = memoryBilling();
    const stripe = scriptedStripe();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await saveDetails(store);

    const result = await createClinicCheckout({
      clinicId: CLINIC_ID,
      userId: USER_ID,
      successUrl: SUCCESS_URL,
      cancelUrl: CANCEL_URL,
      env: BILLING_TEST_ENV,
      db: store.db as never,
      stripe: stripe.port,
    });

    expect(result).toMatchObject({
      ok: true,
      url: "https://checkout.stripe.com/c/pay/cs_riverside_1",
      createdCustomer: true,
    });
    expect(stripe.sessions.created[0]).toMatchObject({
      mode: "subscription",
      customer: "cus_riverside",
      line_items: [
        {
          price: BILLING_TEST_ENV.STRIPE_ESSENTIAL_MONTHLY_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: SUCCESS_URL,
      cancel_url: CANCEL_URL,
    });
    expect(stripe.sessions.created[0]).not.toHaveProperty("price");
    const profile = savedProfile(store);
    expect(profile.legalEntityName).toBe("Harbour Dental Pty Ltd");
    expect(profile.abn).toBe("32671297130");
    expect(profile.stripeCustomerId).toBe("cus_riverside");
    expect(profile.stripeCheckoutSessionId).toBe("cs_riverside_1");
    expect(profile.stripeSubscriptionId).toBeNull();
    expect(store.entitlements.get(CLINIC_ID)?.billingStatus).toBe(
      BillingStatus.OFFER_PREPARED
    );
    expect(store.entitlements.get(CLINIC_ID)?.entitlementStatus).toBe(
      EntitlementStatus.PENDING
    );
    expect(store.entitlementWrites()).toBe(0);
    expect(JSON.stringify(info.mock.calls)).not.toContain(SECRET);
  });

  it("opens Checkout when the clinic has no ABN or ACN", async () => {
    const store = memoryBilling();
    const stripe = scriptedStripe();
    await saveDetails(store, {
      ...billingForm,
      businessNumberKind: "none",
      abn: "not-an-abn",
      acn: "not-an-acn",
    });

    const result = await createClinicCheckout({
      clinicId: CLINIC_ID,
      userId: USER_ID,
      successUrl: SUCCESS_URL,
      cancelUrl: CANCEL_URL,
      env: BILLING_TEST_ENV,
      db: store.db as never,
      stripe: stripe.port,
    });

    expect(result.ok).toBe(true);
    const profile = savedProfile(store);
    expect(profile.abn).toBeNull();
    expect(profile.acn).toBeNull();
    expect(profile.legalEntityName).toBe("Harbour Dental Pty Ltd");
    const customer = stripe.customers.created[0] as Record<string, unknown>;
    expect(customer).toMatchObject({
      email: EMAIL,
      name: "Harbour Dental Pty Ltd",
      metadata: { clinicId: CLINIC_ID },
    });
    expect(customer).not.toHaveProperty("tax_ids");
    expect(JSON.stringify(customer)).not.toMatch(/N\/A|NONE|00000000000/i);
    const session = stripe.sessions.created[0] as Record<string, unknown>;
    expect(session).toMatchObject({
      line_items: [
        {
          price: BILLING_TEST_ENV.STRIPE_ESSENTIAL_MONTHLY_PRICE_ID,
          quantity: 1,
        },
      ],
    });
    expect(session).not.toHaveProperty("automatic_tax");
    expect(session).not.toHaveProperty("tax_id_collection");
    expect(session).not.toHaveProperty("custom_fields");
  });

  it("keeps prepared plan line items when no business identifier is saved", async () => {
    const cases = [
      {
        commercialPlan: "ESSENTIAL" as const,
        billingInterval: "YEARLY" as const,
        offeredAdditionalSiteQuantity: null,
        env: BILLING_TEST_ENV,
        lineItems: [
          {
            price: BILLING_TEST_ENV.STRIPE_ESSENTIAL_YEARLY_PRICE_ID,
            quantity: 1,
          },
        ],
      },
      {
        commercialPlan: "PRACTICE" as const,
        billingInterval: "YEARLY" as const,
        offeredAdditionalSiteQuantity: null,
        env: BILLING_TEST_ENV,
        lineItems: [
          {
            price: BILLING_TEST_ENV.STRIPE_PRACTICE_YEARLY_PRICE_ID,
            quantity: 1,
          },
        ],
      },
      {
        commercialPlan: "GROUP" as const,
        billingInterval: "MONTHLY" as const,
        offeredAdditionalSiteQuantity: 2,
        env: GROUP_BILLING_TEST_ENV,
        lineItems: [
          {
            price: GROUP_BILLING_TEST_ENV.STRIPE_GROUP_MONTHLY_PRICE_ID,
            quantity: 1,
          },
          {
            price:
              GROUP_BILLING_TEST_ENV.STRIPE_GROUP_ADDITIONAL_SITE_MONTHLY_PRICE_ID,
            quantity: 2,
          },
        ],
      },
    ];

    for (const item of cases) {
      const store = memoryBilling();
      const stripe = scriptedStripe();
      store.setOffer(item);
      await saveDetails(store, {
        ...billingForm,
        businessNumberKind: "none",
        abn: "",
        acn: "",
      });
      const result = await createClinicCheckout({
        clinicId: CLINIC_ID,
        userId: USER_ID,
        successUrl: SUCCESS_URL,
        cancelUrl: CANCEL_URL,
        env: item.env,
        db: store.db as never,
        stripe: stripe.port,
      });
      expect(result.ok).toBe(true);
      expect(stripe.sessions.created[0]).toMatchObject({
        line_items: item.lineItems,
      });
      expect(savedProfile(store).abn).toBeNull();
      expect(savedProfile(store).acn).toBeNull();
    }
  });

  it("keeps the saved profile and stays unpaid when Checkout Session creation fails", async () => {
    const store = memoryBilling();
    const stripe = scriptedStripe();
    stripe.fail("session_create");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    await saveDetails(store);

    const result = await createClinicCheckout({
      clinicId: CLINIC_ID,
      userId: USER_ID,
      successUrl: SUCCESS_URL,
      cancelUrl: CANCEL_URL,
      env: BILLING_TEST_ENV,
      db: store.db as never,
      stripe: stripe.port,
    });

    expect(result).toEqual({ ok: false, code: "checkout_failed" });
    expect(checkoutFailureMessage("checkout_failed")).toBe(
      "We couldn't open secure payment. Your details have been saved. Please try again."
    );
    const profile = savedProfile(store);
    expect(profile.legalEntityName).toBe("Harbour Dental Pty Ltd");
    expect(profile.billingEmail).toBe(EMAIL);
    expect(profile.addressLine1).toBe(ADDRESS);
    expect(profile.abn).toBe("32671297130");
    expect(profile.stripeCustomerId).toBe("cus_riverside");
    expect(profile.stripeCheckoutSessionId).toBeNull();
    expect(profile.stripeSubscriptionId).toBeNull();
    expect(store.entitlements.get(CLINIC_ID)).toMatchObject({
      billingStatus: BillingStatus.OFFER_PREPARED,
      entitlementStatus: EntitlementStatus.PENDING,
      commercialPlan: "ESSENTIAL",
      billingInterval: "MONTHLY",
    });
    expect(store.entitlementWrites()).toBe(0);
    expect(stripe.customers.created).toHaveLength(1);
    expect(stripe.sessions.created).toHaveLength(0);

    const logged = JSON.stringify(errorLog.mock.calls);
    expect(logged).toContain("stripe_checkout_session_create");
    expect(logged).toContain(CLINIC_ID);
    expect(logged).toContain("ESSENTIAL");
    expect(logged).toContain("MONTHLY");
    expect(logged).toContain("invalid_request_error");
    expect(logged).toContain("resource_missing");
    expect(logged).toContain("req_SessionCreate1");
    expect(logged).toContain("line_items[0][price]");
    expect(logged).toContain("definitive");
    expect(logged).toContain('"checkoutAttempt":0');
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain(CARD);
    expect(logged).not.toContain(EMAIL);
    expect(logged).not.toContain(ADDRESS);
    expect(logged).not.toContain("Bearer");
    expect(logged).not.toContain("whsec_");

    stripe.fail(null);
    const retry = await createClinicCheckout({
      clinicId: CLINIC_ID,
      userId: USER_ID,
      successUrl: SUCCESS_URL,
      cancelUrl: CANCEL_URL,
      env: BILLING_TEST_ENV,
      db: store.db as never,
      stripe: stripe.port,
    });
    expect(retry.ok).toBe(true);
    expect(stripe.customers.created).toHaveLength(1);
    expect(stripe.customers.updated.length).toBeGreaterThan(1);
    expect(stripe.customers.updated[0]).toMatchObject({ id: "cus_riverside" });
    expect(stripe.sessions.created).toHaveLength(1);
    expect(stripe.sessions.keys[0]).toMatch(/-initial$/);
    expect(stripe.sessions.keys.at(-1)).toMatch(/-attempt-\d+$/);
    expect(stripe.sessions.keys.at(-1)).not.toBe(stripe.sessions.keys[0]);
  });

  it("does not lose billing details when customer creation fails", async () => {
    const store = memoryBilling();
    const stripe = scriptedStripe();
    stripe.fail("customer_create");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    await saveDetails(store);

    const result = await createClinicCheckout({
      clinicId: CLINIC_ID,
      userId: USER_ID,
      successUrl: SUCCESS_URL,
      cancelUrl: CANCEL_URL,
      env: BILLING_TEST_ENV,
      db: store.db as never,
      stripe: stripe.port,
    });

    expect(result).toEqual({ ok: false, code: "checkout_failed" });
    const profile = savedProfile(store);
    expect(profile.abn).toBe("32671297130");
    expect(profile.stripeCustomerId).toBeNull();
    expect(profile.stripeSubscriptionId).toBeNull();
    expect(store.entitlements.get(CLINIC_ID)?.billingStatus).toBe(
      BillingStatus.OFFER_PREPARED
    );
    expect(stripe.customers.created).toHaveLength(1);
    expect(stripe.sessions.created).toHaveLength(0);
  });

  it("reuses an existing customer and does not create another when update fails", async () => {
    const store = memoryBilling();
    const stripe = scriptedStripe();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    await saveDetails(store);
    savedProfile(store).stripeCustomerId = "cus_existing";
    stripe.fail("customer_update");

    const result = await createClinicCheckout({
      clinicId: CLINIC_ID,
      userId: USER_ID,
      successUrl: SUCCESS_URL,
      cancelUrl: CANCEL_URL,
      env: BILLING_TEST_ENV,
      db: store.db as never,
      stripe: stripe.port,
    });

    expect(result).toEqual({ ok: false, code: "checkout_failed" });
    expect(savedProfile(store).stripeCustomerId).toBe("cus_existing");
    expect(savedProfile(store).legalEntityName).toBe("Harbour Dental Pty Ltd");
    expect(stripe.customers.created).toHaveLength(0);
    expect(stripe.customers.updated).toHaveLength(1);
    expect(stripe.sessions.created).toHaveLength(0);
    expect(store.entitlements.get(CLINIC_ID)?.entitlementStatus).toBe(
      EntitlementStatus.PENDING
    );
  });

  it("fails a missing Essential monthly Price before calling Stripe", async () => {
    const store = memoryBilling();
    const stripe = scriptedStripe();
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    await saveDetails(store);
    const env = {
      ...BILLING_TEST_ENV,
      STRIPE_ESSENTIAL_MONTHLY_PRICE_ID: "",
    };

    const result = await createClinicCheckout({
      clinicId: CLINIC_ID,
      userId: USER_ID,
      successUrl: SUCCESS_URL,
      cancelUrl: CANCEL_URL,
      env,
      db: store.db as never,
      stripe: stripe.port,
    });

    expect(result).toEqual({ ok: false, code: "price_not_configured" });
    expect(checkoutFailureMessage("price_not_configured")).not.toBe(
      checkoutFailureMessage("checkout_failed")
    );
    expect(savedProfile(store).abn).toBe("32671297130");
    expect(savedProfile(store).stripeCustomerId).toBeNull();
    expect(store.entitlements.get(CLINIC_ID)?.billingStatus).toBe(
      BillingStatus.OFFER_PREPARED
    );
    expect(stripe.customers.created).toHaveLength(0);
    expect(stripe.sessions.created).toHaveLength(0);
    const logged = JSON.stringify(errorLog.mock.calls);
    expect(logged).toContain("price_resolution");
    expect(logged).toContain("ESSENTIAL");
    expect(logged).toContain("MONTHLY");
    expect(logged).not.toContain(SECRET);
  });

  it("rejects a malformed or production-localhost return URL before creating a customer", async () => {
    const store = memoryBilling();
    const stripe = scriptedStripe();
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    await saveDetails(store);

    const malformed = await createClinicCheckout({
      clinicId: CLINIC_ID,
      userId: USER_ID,
      successUrl: "not a url",
      cancelUrl: CANCEL_URL,
      env: BILLING_TEST_ENV,
      db: store.db as never,
      stripe: stripe.port,
    });
    expect(malformed).toEqual({ ok: false, code: "checkout_failed" });

    const insecure = await createClinicCheckout({
      clinicId: CLINIC_ID,
      userId: USER_ID,
      successUrl: "http://localhost:3000/account/billing/complete",
      cancelUrl: "http://localhost:3000/account/billing/setup",
      env: { ...BILLING_TEST_ENV, VERCEL_ENV: "production" },
      db: store.db as never,
      stripe: stripe.port,
    });
    expect(insecure).toEqual({ ok: false, code: "checkout_failed" });
    expect(savedProfile(store).stripeCustomerId).toBeNull();
    expect(savedProfile(store).abn).toBe("32671297130");
    expect(stripe.customers.created).toHaveLength(0);
    const logged = JSON.stringify(errorLog.mock.calls);
    expect(logged).toContain("malformed_return_url");
    expect(logged).toContain("insecure_production_return_url");
    expect(logged).not.toContain("sk_test_billing_phase1_dummy");
    expect(logged).not.toContain(EMAIL);
    expect(logged).not.toContain(ADDRESS);
  });

  it("logs a transaction failure without the database message", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error(`billing address ${ADDRESS} ${EMAIL} ${SECRET}`);
    failure.name = "PrismaClientKnownRequestError";
    (failure as Error & { code: string }).code = "P2028";
    const db = {
      async $transaction() {
        throw failure;
      },
    };

    const result = await createClinicCheckout({
      clinicId: CLINIC_ID,
      userId: USER_ID,
      successUrl: SUCCESS_URL,
      cancelUrl: CANCEL_URL,
      env: BILLING_TEST_ENV,
      db: db as never,
      stripe: scriptedStripe().port,
    });

    expect(result).toEqual({ ok: false, code: "checkout_failed" });
    const logged = JSON.stringify(errorLog.mock.calls);
    expect(logged).toContain("checkout_transaction");
    expect(logged).toContain("P2028");
    expect(logged).toContain("PrismaClientKnownRequestError");
    expect(logged).toContain(CLINIC_ID);
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain(EMAIL);
    expect(logged).not.toContain(ADDRESS);
  });
});

describe("Stripe failure log fields", () => {
  it("keeps request metadata and drops secrets, messages, and card data", () => {
    const error = stripeApiError({
      param: SECRET,
      requestId: "req_SessionCreate1",
    });

    const fields = checkoutFailureLogFields({
      operation: "stripe_checkout_session_create",
      commercialPlan: "ESSENTIAL",
      billingInterval: "MONTHLY",
      error,
    });

    expect(fields).toMatchObject({
      operation: "stripe_checkout_session_create",
      commercialPlan: "ESSENTIAL",
      billingInterval: "MONTHLY",
      stripeErrorType: "invalid_request_error",
      stripeErrorCode: "resource_missing",
      stripeRequestId: "req_SessionCreate1",
      stripeStatusCode: 404,
    });
    expect(fields.stripeParam).toBeUndefined();
    const serialised = JSON.stringify(fields);
    expect(serialised).not.toContain(SECRET);
    expect(serialised).not.toContain(CARD);
    expect(serialised).not.toContain(EMAIL);
    expect(serialised).not.toContain(ADDRESS);
    expect(JSON.stringify(error)).toContain(SECRET);
  });
});
