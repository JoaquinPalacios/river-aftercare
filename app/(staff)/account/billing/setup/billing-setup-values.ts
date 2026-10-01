import type { BusinessNumberKind } from "@/lib/billing/business-number-kind";

export type BillingSetupSubmittedValues = {
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
  termsAccepted: boolean;
};
