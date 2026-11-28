import type { BusinessNumberKind } from "@/lib/billing/business-number-kind";

export type BillingSetupIdentityDefaults = {
  legalEntityName: string;
  tradingName: string;
  billingContactName: string;
  billingEmail: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  businessNumberKind: BusinessNumberKind;
  abn: string;
  acn: string;
};

function filled(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Initial billing-setup values.
 * Saved profile fields win. A blank contact name or email falls back to the
 * authenticated account, which for a new registration is the verified owner.
 * The account name is never used as the legal entity name.
 */
export function billingSetupFormDefaults(input: {
  clinicName: string;
  identity: BillingSetupIdentityDefaults | null;
  accountName: string | null;
  accountEmail: string;
}): BillingSetupIdentityDefaults {
  const identity = input.identity;
  return {
    legalEntityName: identity?.legalEntityName ?? "",
    tradingName: filled(identity?.tradingName) ?? input.clinicName,
    billingContactName:
      filled(identity?.billingContactName) ?? filled(input.accountName) ?? "",
    billingEmail:
      filled(identity?.billingEmail) ?? filled(input.accountEmail) ?? "",
    addressLine1: identity?.addressLine1 ?? "",
    addressLine2: identity?.addressLine2 ?? "",
    city: identity?.city ?? "",
    region: identity?.region ?? "",
    postalCode: identity?.postalCode ?? "",
    country: identity?.country || "AU",
    businessNumberKind: identity?.businessNumberKind ?? "none",
    abn: identity?.abn ?? "",
    acn: identity?.acn ?? "",
  };
}
