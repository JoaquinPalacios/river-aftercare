import { describe, expect, it } from "vitest";

import {
  billingIdentitySchema,
  normalizeBillingIdentity,
} from "@/lib/billing/billing-identity";

const valid = {
  legalEntityName: "Harbour Dental Pty Ltd",
  tradingName: "Harbour Dental",
  billingContactName: "Alex Chen",
  billingEmail: "accounts@example.com",
  addressLine1: "10 River Street",
  addressLine2: "",
  city: "Tweed Heads",
  region: "NSW",
  postalCode: "2486",
  country: "AU",
  businessNumberKind: "abn" as const,
  abn: "32 671 297 130",
  acn: "",
  termsAccepted: true,
};

describe("billing identity", () => {
  it("accepts a valid billing identity and normalises a formatted ABN", () => {
    const parsed = billingIdentitySchema.parse({
      ...valid,
      acn: "000 000 019",
    });
    expect(normalizeBillingIdentity(parsed)).toMatchObject({
      legalEntityName: "Harbour Dental Pty Ltd",
      billingEmail: "accounts@example.com",
      abn: "32671297130",
      acn: null,
      addressLine2: null,
    });
  });

  it("requires a legal entity name", () => {
    const result = billingIdentitySchema.safeParse({
      ...valid,
      legalEntityName: "  ",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path[0] === "legalEntityName")
      ).toBe(true);
    }
  });

  it("rejects an invalid billing email", () => {
    const result = billingIdentitySchema.safeParse({
      ...valid,
      billingEmail: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("requires a billing address", () => {
    const result = billingIdentitySchema.safeParse({
      ...valid,
      addressLine1: "",
      city: "",
      region: "",
      postalCode: "24",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((issue) => issue.path[0]);
      expect(fields).toEqual(
        expect.arrayContaining(["addressLine1", "city", "region", "postalCode"])
      );
    }
  });

  it("rejects an ABN with a bad checksum", () => {
    const result = billingIdentitySchema.safeParse({
      ...valid,
      abn: "32671297131",
    });
    expect(result.success).toBe(false);
  });

  it("accepts ACN mode and drops a stale ABN", () => {
    const parsed = billingIdentitySchema.parse({
      ...valid,
      businessNumberKind: "acn",
      abn: "32 671 297 130",
      acn: "000 000 019",
    });
    expect(normalizeBillingIdentity(parsed)).toMatchObject({
      abn: null,
      acn: "000000019",
    });
  });

  it("rejects an ACN with a bad checksum", () => {
    const result = billingIdentitySchema.safeParse({
      ...valid,
      businessNumberKind: "acn",
      abn: "",
      acn: "000000018",
    });
    expect(result.success).toBe(false);
  });

  it("accepts neither identifier and stores both as null", () => {
    const parsed = billingIdentitySchema.parse({
      ...valid,
      businessNumberKind: "none",
      abn: "32 671 297 130",
      acn: "000 000 019",
    });
    expect(normalizeBillingIdentity(parsed)).toMatchObject({
      abn: null,
      acn: null,
    });
  });

  it("rejects a blank ABN when ABN is selected and ignores a supplied ACN", () => {
    const result = billingIdentitySchema.safeParse({
      ...valid,
      businessNumberKind: "abn",
      abn: "   ",
      acn: "000 000 019",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual([
        "abn",
      ]);
      expect(result.error.issues[0]?.message).toBe("Enter an ABN.");
    }
  });

  it("rejects a blank ACN when ACN is selected", () => {
    const result = billingIdentitySchema.safeParse({
      ...valid,
      businessNumberKind: "acn",
      abn: "",
      acn: " ",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Enter an ACN.");
    }
  });

  it("does not validate identifier format when None is selected", () => {
    const parsed = billingIdentitySchema.parse({
      ...valid,
      businessNumberKind: "none",
      abn: "not-an-abn",
      acn: "not-an-acn",
    });
    expect(normalizeBillingIdentity(parsed)).toMatchObject({
      abn: null,
      acn: null,
    });
  });

  it("rejects an unknown business identifier selection", () => {
    const result = billingIdentitySchema.safeParse({
      ...valid,
      businessNumberKind: "both",
      abn: "32 671 297 130",
      acn: "000 000 019",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) => issue.path[0] === "businessNumberKind"
        )
      ).toBe(true);
    }
  });

  it("requires Terms acceptance", () => {
    const result = billingIdentitySchema.safeParse({
      ...valid,
      termsAccepted: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path[0] === "termsAccepted")
      ).toBe(true);
    }
  });
});
