import type { ServiceCategory } from "@prisma/client";

import { DEMO_AFTERCARE_TENANT_SLUG } from "@/lib/aftercare/demo-tenant";

/**
 * Allowlisted demo clinics that may receive an explicit sample adoption.
 * Dental uses the existing demodental account. Other categories stay
 * undesignated until a demo clinic and guide exist for them.
 */
export interface DesignatedDemo {
  serviceCategory: ServiceCategory;
  clinicSlug: string;
}

export const DESIGNATED_DEMOS: readonly DesignatedDemo[] = [
  {
    serviceCategory: "DENTAL",
    clinicSlug: DEMO_AFTERCARE_TENANT_SLUG,
  },
];

export function designatedDemoForCategory(
  serviceCategory: ServiceCategory
): DesignatedDemo | null {
  return (
    DESIGNATED_DEMOS.find((demo) => demo.serviceCategory === serviceCategory) ??
    null
  );
}
