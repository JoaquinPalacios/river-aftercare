import { isDemoTenant } from "@/lib/aftercare/demo-tenant";
import { isValidCareGuideSlug } from "@/lib/aftercare/slug-rules";
import { isSharedDemoHostnameLabel } from "@/lib/tenancy/shared-demo-hostname";
import { isReservedTenantSlug } from "@/lib/tenancy/reserved-slugs";

export const REGISTRATION_INTENT_GENERIC_MESSAGE =
  "If that address can be registered, we've sent a verification link.";

export const REGISTRATION_INTENT_INVALID_LINK_MESSAGE =
  "This verification link is invalid or has expired.";

export const REGISTRATION_VERIFY_CONFIRMED_MESSAGE =
  "Your email is confirmed. We're creating the clinic.";

export const REGISTRATION_SLUG_RECOVERY_MESSAGE =
  "That clinic address is already in use. Choose another one to continue. Your registration is still here.";

export const REGISTRATION_PROVISION_RETRY_MESSAGE =
  "We couldn't create the clinic just now. Open the verification link again.";

export const REGISTRATION_SIGN_IN_MESSAGE =
  "Your clinic is ready. Sign in to continue billing setup.";

export const REGISTRATION_DISPOSABLE_EMAIL_MESSAGE =
  "Use a permanent clinic email address. Temporary inbox addresses can't register.";

export const REGISTRATION_VERIFY_EXPIRED_MESSAGE =
  "This verification link has expired. Request another email if you still want to register.";

export const REGISTRATION_TERMS_REQUIRED_MESSAGE =
  "Accept the Terms and acknowledge the Privacy Policy to continue.";

export const REGISTRATION_VERIFICATION_FAILED_MESSAGE =
  "We couldn't confirm this request. Please try again.";

export const REGISTRATION_SLUG_INVALID_MESSAGE = "Enter a valid tenant slug.";
export const REGISTRATION_SLUG_RESERVED_MESSAGE =
  "That hostname is reserved by the platform.";
export const REGISTRATION_SLUG_DEMO_MESSAGE =
  "That hostname is reserved for the interactive demo.";
export const REGISTRATION_SLUG_TAKEN_MESSAGE =
  "That tenant slug is already in use.";

export const REGISTRATION_PLAN_MESSAGE = "Choose Essential or Practice.";
export const REGISTRATION_INTERVAL_MESSAGE =
  "Choose monthly or annual billing.";
export const REGISTRATION_CATEGORY_REQUIRED_MESSAGE =
  "Select at least one practice category.";
export const REGISTRATION_CATEGORY_INVALID_MESSAGE =
  "Choose a supported practice category.";
export const REGISTRATION_PRACTICE_NAME_REQUIRED_MESSAGE =
  "Enter the practice name.";
export const REGISTRATION_PRACTICE_NAME_MAX_MESSAGE =
  "Practice name must be 80 characters or fewer.";
export const REGISTRATION_PRACTICE_NAME_INVALID_MESSAGE =
  "Enter a valid practice name.";

export function registrationSlugPolicyMessage(slug: string): string | null {
  if (!isValidCareGuideSlug(slug)) {
    return REGISTRATION_SLUG_INVALID_MESSAGE;
  }
  if (isReservedTenantSlug(slug)) {
    return REGISTRATION_SLUG_RESERVED_MESSAGE;
  }
  if (isDemoTenant(slug) || isSharedDemoHostnameLabel(slug)) {
    return REGISTRATION_SLUG_DEMO_MESSAGE;
  }
  return null;
}
