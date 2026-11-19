import "server-only";

import { PROFILE_NAME_REQUIRED_MESSAGE } from "@/lib/auth/account-profile-fields";
import {
  normalizeProfileName,
  profileNameError,
} from "@/lib/auth/account-profile-schema";
import {
  AccountTokenError,
  normalizeAccountTokenEmail,
} from "@/lib/auth/account-token-service";
import { newPasswordPolicyError } from "@/lib/auth/password-policy";
import {
  SERVICE_CATEGORIES,
  uniqueServiceCategories,
  type ServiceCategory,
} from "@/lib/aftercare/service-category";
import {
  PRIVACY_ACKNOWLEDGEMENT_VERSION,
  TERMS_ACCEPTANCE_VERSION,
} from "@/lib/legal/status";

import {
  REGISTRATION_CATEGORY_INVALID_MESSAGE,
  REGISTRATION_CATEGORY_REQUIRED_MESSAGE,
  REGISTRATION_INTENT_GENERIC_MESSAGE,
  REGISTRATION_INTENT_INVALID_LINK_MESSAGE,
  REGISTRATION_INTERVAL_MESSAGE,
  REGISTRATION_PLAN_MESSAGE,
  REGISTRATION_PRACTICE_NAME_INVALID_MESSAGE,
  REGISTRATION_PRACTICE_NAME_MAX_MESSAGE,
  REGISTRATION_PRACTICE_NAME_REQUIRED_MESSAGE,
  REGISTRATION_SLUG_DEMO_MESSAGE,
  REGISTRATION_SLUG_INVALID_MESSAGE,
  REGISTRATION_SLUG_RESERVED_MESSAGE,
  REGISTRATION_SLUG_TAKEN_MESSAGE,
  REGISTRATION_TERMS_REQUIRED_MESSAGE,
  REGISTRATION_VERIFY_CONFIRMED_MESSAGE,
  REGISTRATION_VERIFY_EXPIRED_MESSAGE,
  registrationSlugPolicyMessage,
} from "@/lib/auth/registration-copy";

export {
  REGISTRATION_CATEGORY_INVALID_MESSAGE,
  REGISTRATION_CATEGORY_REQUIRED_MESSAGE,
  REGISTRATION_INTENT_GENERIC_MESSAGE,
  REGISTRATION_INTENT_INVALID_LINK_MESSAGE,
  REGISTRATION_INTERVAL_MESSAGE,
  REGISTRATION_PLAN_MESSAGE,
  REGISTRATION_PRACTICE_NAME_INVALID_MESSAGE,
  REGISTRATION_PRACTICE_NAME_MAX_MESSAGE,
  REGISTRATION_PRACTICE_NAME_REQUIRED_MESSAGE,
  REGISTRATION_SLUG_DEMO_MESSAGE,
  REGISTRATION_SLUG_INVALID_MESSAGE,
  REGISTRATION_SLUG_RESERVED_MESSAGE,
  REGISTRATION_SLUG_TAKEN_MESSAGE,
  REGISTRATION_TERMS_REQUIRED_MESSAGE,
  REGISTRATION_VERIFY_CONFIRMED_MESSAGE,
  REGISTRATION_VERIFY_EXPIRED_MESSAGE,
  registrationSlugPolicyMessage,
};

export const REGISTRATION_INTENT_TTL_MS = 24 * 60 * 60 * 1000;

export const REGISTRATION_PLANS = ["ESSENTIAL", "PRACTICE"] as const;
export const REGISTRATION_INTERVALS = ["MONTHLY", "YEARLY"] as const;

export type RegistrationPlan = (typeof REGISTRATION_PLANS)[number];
export type RegistrationInterval = (typeof REGISTRATION_INTERVALS)[number];

export type RegistrationTokenFailure =
  "missing" | "expired" | "consumed" | "revoked";

export type RegistrationIntentView = {
  id: string;
  email: string;
  ownerName: string;
  practiceName: string;
  slug: string;
  serviceCategories: ServiceCategory[];
  commercialPlan: RegistrationPlan;
  billingInterval: RegistrationInterval;
  termsVersion: string;
  privacyVersionAcknowledged: string;
  expiresAt: Date;
};

/**
 * Passed only to the provisioning callback inside the consume transaction.
 * The stored hash is redacted after the callback returns.
 */
export type RegistrationIntentSecret = RegistrationIntentView & {
  passwordHash: string;
};

export type RegistrationField =
  | "email"
  | "password"
  | "ownerName"
  | "practiceName"
  | "slug"
  | "serviceCategories"
  | "commercialPlan"
  | "billingInterval";

export type RegistrationFieldError = {
  status: "invalid";
  field: RegistrationField;
  message: string;
};

export type RegistrationSlugUnavailable = {
  status: "slug_unavailable";
  message: string;
};

export function registrationIntentExpiresAt(now: Date): Date {
  return new Date(now.getTime() + REGISTRATION_INTENT_TTL_MS);
}

export function registrationIntentLockKey(email: string): string {
  return `registration-intent-email:${email}`;
}

export function registrationTokenFailure(
  row: {
    revokedAt: Date | null;
    consumedAt: Date | null;
    expiresAt: Date;
  } | null,
  now: Date
): RegistrationTokenFailure | null {
  if (!row) {
    return "missing";
  }
  if (row.revokedAt) {
    return "revoked";
  }
  if (row.consumedAt) {
    return "consumed";
  }
  if (row.expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }
  return null;
}

/**
 * Future public copy. Every non-slug failure looks the same.
 * A slug collision is returned to the person who already holds the token
 * so they can choose another hostname. It does not name another clinic.
 */
export function registrationConsumePublicOutcome(
  reason: RegistrationTokenFailure | "account_exists" | "slug_unavailable"
): "invalid" | "slug_unavailable" {
  if (reason === "slug_unavailable") {
    return "slug_unavailable";
  }
  return "invalid";
}

function practiceNameError(name: string): string | null {
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    return REGISTRATION_PRACTICE_NAME_INVALID_MESSAGE;
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return REGISTRATION_PRACTICE_NAME_REQUIRED_MESSAGE;
  }
  if (trimmed.length > 80) {
    return REGISTRATION_PRACTICE_NAME_MAX_MESSAGE;
  }
  return null;
}

function categoriesError(
  categories: readonly string[]
): { message: string } | { categories: ServiceCategory[] } {
  if (categories.length === 0) {
    return { message: REGISTRATION_CATEGORY_REQUIRED_MESSAGE };
  }
  const allowed = new Set<string>(SERVICE_CATEGORIES);
  if (categories.some((category) => !allowed.has(category))) {
    return { message: REGISTRATION_CATEGORY_INVALID_MESSAGE };
  }
  const unique = uniqueServiceCategories(categories as ServiceCategory[]);
  if (unique.length === 0) {
    return { message: REGISTRATION_CATEGORY_REQUIRED_MESSAGE };
  }
  return { categories: unique };
}

export type ValidRegistrationInput = {
  email: string;
  password: string;
  ownerName: string;
  practiceName: string;
  slug: string;
  serviceCategories: ServiceCategory[];
  commercialPlan: RegistrationPlan;
  billingInterval: RegistrationInterval;
  termsVersion: string;
  privacyVersionAcknowledged: string;
};

export function validateRegistrationInput(input: {
  email: string;
  password: string;
  ownerName: string;
  practiceName: string;
  slug: string;
  serviceCategories: readonly string[];
  commercialPlan: string;
  billingInterval: string;
}):
  | { ok: true; value: ValidRegistrationInput }
  | { ok: false; error: RegistrationFieldError } {
  let email: string;
  try {
    email = normalizeAccountTokenEmail(input.email);
  } catch (error) {
    if (error instanceof AccountTokenError) {
      return {
        ok: false,
        error: {
          status: "invalid",
          field: "email",
          message: "Enter a valid email address.",
        },
      };
    }
    throw error;
  }

  const passwordError = newPasswordPolicyError(input.password);
  if (passwordError) {
    return {
      ok: false,
      error: { status: "invalid", field: "password", message: passwordError },
    };
  }

  const ownerError = profileNameError(input.ownerName);
  const ownerName = normalizeProfileName(input.ownerName);
  if (ownerError || !ownerName) {
    return {
      ok: false,
      error: {
        status: "invalid",
        field: "ownerName",
        message: ownerError ?? PROFILE_NAME_REQUIRED_MESSAGE,
      },
    };
  }

  const practiceError = practiceNameError(input.practiceName);
  if (practiceError) {
    return {
      ok: false,
      error: {
        status: "invalid",
        field: "practiceName",
        message: practiceError,
      },
    };
  }

  const slugMessage = registrationSlugPolicyMessage(input.slug);
  if (slugMessage) {
    return {
      ok: false,
      error: { status: "invalid", field: "slug", message: slugMessage },
    };
  }

  const categories = categoriesError(input.serviceCategories);
  if ("message" in categories) {
    return {
      ok: false,
      error: {
        status: "invalid",
        field: "serviceCategories",
        message: categories.message,
      },
    };
  }

  if (
    input.commercialPlan !== "ESSENTIAL" &&
    input.commercialPlan !== "PRACTICE"
  ) {
    return {
      ok: false,
      error: {
        status: "invalid",
        field: "commercialPlan",
        message: REGISTRATION_PLAN_MESSAGE,
      },
    };
  }

  if (
    input.billingInterval !== "MONTHLY" &&
    input.billingInterval !== "YEARLY"
  ) {
    return {
      ok: false,
      error: {
        status: "invalid",
        field: "billingInterval",
        message: REGISTRATION_INTERVAL_MESSAGE,
      },
    };
  }

  return {
    ok: true,
    value: {
      email,
      password: input.password,
      ownerName,
      practiceName: input.practiceName.trim(),
      slug: input.slug,
      serviceCategories: categories.categories,
      commercialPlan: input.commercialPlan,
      billingInterval: input.billingInterval,
      termsVersion: TERMS_ACCEPTANCE_VERSION,
      privacyVersionAcknowledged: PRIVACY_ACKNOWLEDGEMENT_VERSION,
    },
  };
}
