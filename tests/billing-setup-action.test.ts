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
  overrides: Partial<typeof validFields> = {},
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
      })
    );
    expect(redirectMock).toHaveBeenCalledWith(
      "https://checkout.stripe.com/c/pay/cs_test_mock"
    );
  });
});
