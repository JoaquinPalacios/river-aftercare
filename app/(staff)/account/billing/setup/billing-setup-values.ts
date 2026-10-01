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
  businessNumberKind: "abn" | "acn";
  abn: string;
  acn: string;
  termsAccepted: boolean;
};
