import { notFound } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/auth/require-authenticated-user";
import {
  getAuthContext,
  MultipleClinicMembershipsError,
  type ClinicMembershipContext,
} from "@/lib/auth/session";
import {
  loadClinicBillingView,
  type ClinicBillingView,
} from "@/lib/billing/billing-page";
import { marketingPublicLinks } from "@/lib/marketing/public-links";

export type BillingPageContext = {
  userId: string;
  membership: ClinicMembershipContext | null;
  view: ClinicBillingView | null;
  contactHref: string;
  termsHref: string;
  privacyHref: string;
};

export async function loadBillingPageContext(): Promise<BillingPageContext> {
  const user = await requireAuthenticatedUser();
  let membership: ClinicMembershipContext | null = null;
  try {
    membership = (await getAuthContext()).clinicMembership;
  } catch (error) {
    if (!(error instanceof MultipleClinicMembershipsError)) {
      throw error;
    }
  }
  const links = await marketingPublicLinks();
  const home = links.homeHref.endsWith("/")
    ? links.homeHref
    : `${links.homeHref}/`;
  const view = membership
    ? await loadClinicBillingView(membership.clinic.id)
    : null;

  if (membership && !view) {
    notFound();
  }

  return {
    userId: user.id,
    membership,
    view,
    contactHref: new URL("contact", home).href,
    termsHref: new URL("terms", home).href,
    privacyHref: new URL("privacy", home).href,
  };
}
