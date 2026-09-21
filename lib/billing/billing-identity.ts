import "server-only";

import { z } from "zod";

import {
  digitsOnly,
  isValidAbn,
  isValidAcn,
} from "@/lib/billing/australian-business-numbers";

export const AU_REGION_OPTIONS = [
  { value: "ACT", label: "Australian Capital Territory" },
  { value: "NSW", label: "New South Wales" },
  { value: "NT", label: "Northern Territory" },
  { value: "QLD", label: "Queensland" },
  { value: "SA", label: "South Australia" },
  { value: "TAS", label: "Tasmania" },
  { value: "VIC", label: "Victoria" },
  { value: "WA", label: "Western Australia" },
] as const;

const AU_REGION_VALUES = AU_REGION_OPTIONS.map((option) => option.value);

export const billingIdentitySchema = z
  .object({
    legalEntityName: z
      .string()
      .trim()
      .min(1, "Enter the legal entity name.")
      .max(160),
    tradingName: z.string().trim().max(160),
    billingContactName: z
      .string()
      .trim()
      .min(1, "Enter the billing contact name.")
      .max(120),
    billingEmail: z
      .string()
      .trim()
      .max(200)
      .email("Enter a valid billing email."),
    addressLine1: z
      .string()
      .trim()
      .min(1, "Enter the billing address.")
      .max(120),
    addressLine2: z.string().trim().max(120),
    city: z.string().trim().min(1, "Enter the suburb or city.").max(80),
    region: z.string().trim().min(1, "Choose a state or region.").max(80),
    postalCode: z.string().trim().min(1, "Enter the postcode.").max(20),
    country: z.string().trim().toUpperCase().min(2, "Choose a country.").max(2),
    businessNumberKind: z.enum(["abn", "acn"]),
    abn: z.string().trim().max(20),
    acn: z.string().trim().max(20),
    termsAccepted: z.boolean(),
  })
  .superRefine((value, context) => {
    if (!/^[A-Z]{2}$/.test(value.country)) {
      context.addIssue({
        code: "custom",
        path: ["country"],
        message: "Choose a country.",
      });
    }

    if (value.country === "AU") {
      if (
        !AU_REGION_VALUES.includes(
          value.region as (typeof AU_REGION_VALUES)[number]
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["region"],
          message: "Choose an Australian state or territory.",
        });
      }
      if (!/^\d{4}$/.test(value.postalCode)) {
        context.addIssue({
          code: "custom",
          path: ["postalCode"],
          message: "Enter a 4-digit postcode.",
        });
      }
    }

    if (!value.termsAccepted) {
      context.addIssue({
        code: "custom",
        path: ["termsAccepted"],
        message: "Agree to the Terms & Conditions to continue.",
      });
    }

    if (value.businessNumberKind === "abn") {
      if (!value.abn) {
        context.addIssue({
          code: "custom",
          path: ["abn"],
          message: "Enter an ABN, or choose No ABN to enter an ACN.",
        });
      } else if (!isValidAbn(value.abn)) {
        context.addIssue({
          code: "custom",
          path: ["abn"],
          message: "Enter a valid 11-digit ABN.",
        });
      }
      return;
    }

    if (!value.acn) {
      context.addIssue({
        code: "custom",
        path: ["acn"],
        message: "Enter an ACN.",
      });
    } else if (!isValidAcn(value.acn)) {
      context.addIssue({
        code: "custom",
        path: ["acn"],
        message: "Enter a valid 9-digit ACN.",
      });
    }
  });

export type BillingIdentityFormInput = z.input<typeof billingIdentitySchema>;

export type NormalizedBillingIdentity = {
  legalEntityName: string;
  tradingName: string | null;
  billingContactName: string;
  billingEmail: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  abn: string | null;
  acn: string | null;
};

export function normalizeBillingIdentity(
  value: z.output<typeof billingIdentitySchema>
): NormalizedBillingIdentity {
  const abn =
    value.businessNumberKind === "abn" && value.abn
      ? digitsOnly(value.abn)
      : null;
  const acn =
    value.businessNumberKind === "acn" && value.acn
      ? digitsOnly(value.acn)
      : null;

  return {
    legalEntityName: value.legalEntityName,
    tradingName: value.tradingName || null,
    billingContactName: value.billingContactName,
    billingEmail: value.billingEmail.toLowerCase(),
    addressLine1: value.addressLine1,
    addressLine2: value.addressLine2 || null,
    city: value.city,
    region: value.region,
    postalCode: value.postalCode,
    country: value.country,
    abn,
    acn,
  };
}

export function billingIdentityFromForm(formData: FormData): {
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
  businessNumberKind: string;
  abn: string;
  acn: string;
  termsAccepted: boolean;
} {
  const read = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };

  return {
    legalEntityName: read("legalEntityName"),
    tradingName: read("tradingName"),
    billingContactName: read("billingContactName"),
    billingEmail: read("billingEmail"),
    addressLine1: read("addressLine1"),
    addressLine2: read("addressLine2"),
    city: read("city"),
    region: read("region"),
    postalCode: read("postalCode"),
    country: read("country") || "AU",
    businessNumberKind: read("businessNumberKind") || "abn",
    abn: read("abn"),
    acn: read("acn"),
    termsAccepted: formData.get("termsAccepted") === "on",
  };
}
