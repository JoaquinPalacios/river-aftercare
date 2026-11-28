import "server-only";

import { isRegistrationEnabled } from "@/lib/auth/registration-flag";
import {
  REGISTRATION_PAGE_PATH,
  START_FREE_TRIAL_LABEL,
  type MarketingRegistrationOffer,
} from "@/lib/marketing/registration-cta";
import { staffAppOrigin } from "@/lib/tenancy/staff-app-origin";

/**
 * Marketing pages set `dynamic = "error"`, so this read is fixed at build time.
 * `REGISTRATION_ENABLED` is the existing server flag. It is not a public client
 * variable, and this module does not read the request. Changing the flag takes
 * effect on the next deployment, the same way other marketing configuration does.
 */
export function marketingRegistrationOffer(
  env: NodeJS.ProcessEnv = process.env
): MarketingRegistrationOffer {
  if (!isRegistrationEnabled(env)) {
    return { enabled: false };
  }

  return {
    enabled: true,
    href: `${staffAppOrigin(env)}${REGISTRATION_PAGE_PATH}`,
    label: START_FREE_TRIAL_LABEL,
  };
}
