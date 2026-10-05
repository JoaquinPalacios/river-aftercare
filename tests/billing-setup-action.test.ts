import { ClinicMembershipRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireClinicAdminMock = vi.hoisted(() => vi.fn());
const createClinicCheckoutMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const upsertMock = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "app.localhost:3000" }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => redirectMock(url),
}));

vi.mock("@/lib/tenancy/staff-app-origin", () => ({
  isStaffAppHost: () => true,
}));

vi.mock("@/lib/auth/require-clinic-admin", () => ({
  requireClinicAdmin: requireClinicAdminMock,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    $transaction: transactionMock,
    clinicNegotiatedOffer: {
      findFirst: async () => null,
    },
  }),
}));

vi.mock("@/lib/billing/checkout", async () => {
  const actual = await vi.importActual<typeof import("@/lib/billing/checkout")>(
    "@/lib/billing/checkout"
  );
  return {
    ...actual,
    createClinicCheckout: createClinicCheckoutMock,
  };
});

import { continueToSecurePaymentAction } from "@/app/(staff)/account/billing/actions";
import { checkoutFailureMessage } from "@/lib/billing/checkout";

const validFields = {
  legalEntityName: "Harbour Dental Pty Ltd",
  tradingName: "Harbour Dental",
  billingContactName: "Alex Chen",
  billingEmail: "accounts@example.com",
  addressLine1: "10 River Street",
  addressLine2: "Level 2",
  city: "Tweed Heads",
  region: "NSW",
  postalCode: "2486",
  country: "AU",
  businessNumberKind: "abn",
  abn: "32 671 297 130",
  acn: "",
};

function billingForm(
  overrides: Partial<Omit<typeof validFields, "businessNumberKind">> & {
    businessNumberKind?: string;
  } = {},
  termsAccepted = true
) {
  const formData = new FormData();
  const fields = { ...validFields, ...overrides };
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  if (termsAccepted) {
    formData.set("termsAccepted", "on");
  }
  return formData;
}

describe("continue to secure payment validation", () => {
  beforeEach(() => {
    requireClinicAdminMock.mockReset();
    createClinicCheckoutMock.mockReset();
    redirectMock.mockReset();
    transactionMock.mockReset();
    upsertMock.mockReset();
    requireClinicAdminMock.mockResolvedValue({
      user: { id: "user_admin", platformRole: "NONE" },
      clinicMembership: {
        role: ClinicMembershipRole.ADMIN,
        source: "membership",
        clinic: { id: "clinic_a", name: "Harbour Dental" },
      },
    });
    redirectMock.mockImplementation((url: string) => {
      const error = new Error("NEXT_REDIRECT");
      (error as Error & { digest: string }).digest = `NEXT_REDIRECT;${url}`;
      throw error;
    });
    createClinicCheckoutMock.mockImplementation(() => {
      throw new Error("Stripe Checkout must not start for invalid billing.");
    });
    transactionMock.mockImplementation(() => {
      throw new Error("Invalid billing must not be saved.");
    });
  });

  it("returns the invalid ABN and every other submitted value without checkout", async () => {
    const result = await continueToSecurePaymentAction(
      {},
      billingForm({ abn: "12 345 678 901" })
    );

    expect(result.error).toBe("Please review the billing details.");
    expect(result.fieldErrors?.abn).toBe("Enter a valid 11-digit ABN.");
    expect(result.values).toMatchObject({
      ...validFields,
      abn: "12 345 678 901",
      termsAccepted: true,
    });
    expect(createClinicCheckoutMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("rejects an 11-digit ABN with a bad checksum", async () => {
    const result = await continueToSecurePaymentAction(
      {},
      billingForm({ abn: "32671297131" })
    );

    expect(result.fieldErrors?.abn).toBe("Enter a valid 11-digit ABN.");
    expect(result.values?.abn).toBe("32671297131");
    expect(createClinicCheckoutMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("keeps submitted values when a non-ABN field is invalid", async () => {
    const result = await continueToSecurePaymentAction(
      {},
      billingForm({ billingEmail: "not-an-email" })
    );

    expect(result.fieldErrors?.billingEmail).toBe(
      "Enter a valid billing email."
    );
    expect(result.fieldErrors?.abn).toBeUndefined();
    expect(result.values).toMatchObject({
      billingEmail: "not-an-email",
      abn: "32 671 297 130",
      legalEntityName: "Harbour Dental Pty Ltd",
      postalCode: "2486",
      termsAccepted: true,
    });
    expect(createClinicCheckoutMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("reports every invalid field and preserves the submitted form", async () => {
    const result = await continueToSecurePaymentAction(
      {},
      billingForm(
        {
          legalEntityName: " ",
          billingEmail: "not-an-email",
          postalCode: "",
          abn: "12 345 678 901",
        },
        false
      )
    );

    expect(result.fieldErrors).toMatchObject({
      legalEntityName: "Enter the legal entity name.",
      billingEmail: "Enter a valid billing email.",
      postalCode: "Enter the postcode.",
      abn: "Enter a valid 11-digit ABN.",
      termsAccepted: "Agree to the Terms & Conditions to continue.",
    });
    expect(result.values).toMatchObject({
      legalEntityName: " ",
      billingEmail: "not-an-email",
      postalCode: "",
      abn: "12 345 678 901",
      tradingName: "Harbour Dental",
      addressLine1: "10 River Street",
      addressLine2: "Level 2",
      city: "Tweed Heads",
      region: "NSW",
      country: "AU",
      termsAccepted: false,
    });
    expect(createClinicCheckoutMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("accepts a spaced ABN and continues to Checkout", async () => {
    transactionMock.mockImplementation(async (callback) =>
      callback({
        clinicBillingProfile: { upsert: upsertMock },
        legalAcceptance: {
          create: vi.fn().mockResolvedValue({
            id: "acceptance_1",
            termsVersion: "2026-09-21",
            privacyVersionAcknowledged: "2026-09-21",
            acceptedAt: new Date("2026-10-01T00:00:00.000Z"),
            clinicId: "clinic_a",
            userId: "user_admin",
          }),
        },
      })
    );
    upsertMock.mockResolvedValue({});
    createClinicCheckoutMock.mockResolvedValue({
      ok: true,
      url: "https://checkout.stripe.com/c/pay/cs_test_mock",
    });

    await expect(
      continueToSecurePaymentAction({}, billingForm())
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          abn: "32671297130",
          acn: null,
          billingEmail: "accounts@example.com",
        }),
        update: expect.objectContaining({
          abn: "32671297130",
          acn: null,
        }),
      })
    );
    expect(createClinicCheckoutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: "clinic_a",
        userId: "user_admin",
        successUrl: "http://app.localhost:3000/account/billing/complete",
        cancelUrl:
          "http://app.localhost:3000/account/billing/setup?checkout=cancelled",
      })
    );
    expect(redirectMock).toHaveBeenCalledWith(
      "https://checkout.stripe.com/c/pay/cs_test_mock"
    );
  });

  it("saves no identifier, accepts Terms, and starts Checkout", async () => {
    allowSavedBilling();
    createClinicCheckoutMock.mockResolvedValue({
      ok: true,
      url: "https://checkout.stripe.com/c/pay/cs_test_mock",
    });

    await expect(
      continueToSecurePaymentAction(
        {},
        billingForm({ businessNumberKind: "none", abn: "", acn: "" })
      )
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ abn: null, acn: null }),
        update: expect.objectContaining({ abn: null, acn: null }),
      })
    );
    expect(createClinicCheckoutMock).toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith(
      "https://checkout.stripe.com/c/pay/cs_test_mock"
    );
  });

  it("blocks Terms without asking for an identifier when None is selected", async () => {
    const result = await continueToSecurePaymentAction(
      {},
      billingForm({ businessNumberKind: "none", abn: "", acn: "" }, false)
    );

    expect(result.fieldErrors?.termsAccepted).toBe(
      "Agree to the Terms & Conditions to continue."
    );
    expect(result.fieldErrors?.abn).toBeUndefined();
    expect(result.fieldErrors?.acn).toBeUndefined();
    expect(result.values?.businessNumberKind).toBe("none");
    expect(createClinicCheckoutMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects a blank ABN and a blank ACN for the selected option", async () => {
    const blankAbn = await continueToSecurePaymentAction(
      {},
      billingForm({ businessNumberKind: "abn", abn: " ", acn: "000 000 019" })
    );
    expect(blankAbn.fieldErrors?.abn).toBe("Enter an ABN.");
    expect(blankAbn.fieldErrors?.acn).toBeUndefined();

    const blankAcn = await continueToSecurePaymentAction(
      {},
      billingForm({
        businessNumberKind: "acn",
        abn: "32 671 297 130",
        acn: "",
      })
    );
    expect(blankAcn.fieldErrors?.acn).toBe("Enter an ACN.");
    expect(blankAcn.fieldErrors?.abn).toBeUndefined();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed ACN and clears a stale ABN when ACN is saved", async () => {
    const malformed = await continueToSecurePaymentAction(
      {},
      billingForm({
        businessNumberKind: "acn",
        abn: "32 671 297 130",
        acn: "000000018",
      })
    );
    expect(malformed.fieldErrors?.acn).toBe("Enter a valid 9-digit ACN.");
    expect(transactionMock).not.toHaveBeenCalled();

    allowSavedBilling();
    createClinicCheckoutMock.mockResolvedValue({
      ok: true,
      url: "https://checkout.stripe.com/c/pay/cs_test_mock",
    });
    await expect(
      continueToSecurePaymentAction(
        {},
        billingForm({
          businessNumberKind: "acn",
          abn: "32 671 297 130",
          acn: "000 000 019",
        })
      )
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          abn: null,
          acn: "000000019",
        }),
      })
    );
  });

  it("persists only the selected identifier when both values are submitted", async () => {
    allowSavedBilling();
    createClinicCheckoutMock.mockResolvedValue({
      ok: true,
      url: "https://checkout.stripe.com/c/pay/cs_test_mock",
    });

    await expect(
      continueToSecurePaymentAction(
        {},
        billingForm({
          businessNumberKind: "abn",
          abn: "32 671 297 130",
          acn: "000 000 019",
        })
      )
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          abn: "32671297130",
          acn: null,
        }),
      })
    );

    upsertMock.mockClear();
    await expect(
      continueToSecurePaymentAction(
        {},
        billingForm({
          businessNumberKind: "none",
          abn: "32 671 297 130",
          acn: "000 000 019",
        })
      )
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ abn: null, acn: null }),
      })
    );
  });

  it("does not save an unknown identifier selection", async () => {
    const result = await continueToSecurePaymentAction(
      {},
      billingForm({
        businessNumberKind: "both",
        abn: "32 671 297 130",
        acn: "000 000 019",
      })
    );

    expect(result.fieldErrors?.businessNumberKind).toBe(
      "Choose ABN, ACN, or None."
    );
    expect(transactionMock).not.toHaveBeenCalled();
    expect(createClinicCheckoutMock).not.toHaveBeenCalled();
  });

  it("keeps the saved billing details when Checkout cannot open", async () => {
    allowSavedBilling();
    createClinicCheckoutMock.mockResolvedValue({
      ok: false,
      code: "checkout_failed",
    });

    const result = await continueToSecurePaymentAction({}, billingForm());

    expect(result.error).toBe(checkoutFailureMessage("checkout_failed"));
    expect(result.error).toBe(
      "We couldn't open secure payment. Your details have been saved. Please try again."
    );
    expect(result.values).toMatchObject({
      legalEntityName: "Harbour Dental Pty Ltd",
      billingEmail: "accounts@example.com",
      addressLine1: "10 River Street",
      abn: "32 671 297 130",
      termsAccepted: true,
    });
    expect(upsertMock).toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("logs an unexpected Checkout failure without the exception text", async () => {
    allowSavedBilling();
    const secret = "sk_live_do_not_log";
    const card = "4242424242424242";
    createClinicCheckoutMock.mockRejectedValue(
      new Error(`Stripe said ${secret} and ${card}`)
    );
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const infoLog = vi.spyOn(console, "info").mockImplementation(() => {});

    const result = await continueToSecurePaymentAction({}, billingForm());

    expect(result.error).toBe(checkoutFailureMessage("checkout_failed"));
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain(card);
    const logged = JSON.stringify(errorLog.mock.calls);
    expect(logged).toContain("checkout_action_failed");
    expect(logged).toContain("clinic_a");
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain(card);
    expect(logged).not.toContain("accounts@example.com");
    errorLog.mockRestore();
    infoLog.mockRestore();
  });
});

function allowSavedBilling() {
  transactionMock.mockImplementation(async (callback) =>
    callback({
      clinicBillingProfile: { upsert: upsertMock },
      legalAcceptance: {
        create: vi.fn().mockResolvedValue({
          id: "acceptance_1",
          termsVersion: "2026-09-21",
          privacyVersionAcknowledged: "2026-09-21",
          acceptedAt: new Date("2026-10-01T00:00:00.000Z"),
          clinicId: "clinic_a",
          userId: "user_admin",
        }),
      },
    })
  );
  upsertMock.mockResolvedValue({});
}
