import type { ServiceCategory } from "@prisma/client";

import {
  DEMO_AFTERCARE_TENANT_SLUG,
  PHYSIO_DEMO_TENANT_SLUG,
} from "@/lib/aftercare/demo-tenant";

/**
 * Allowlisted demo clinics that may receive an explicit sample adoption.
 * A demo account can use only the active sample for its mapped category.
 * Chiropractic and Cosmetic & Aesthetic stay undesignated.
 */
export interface DesignatedDemo {
  serviceCategory: ServiceCategory;
  clinicSlug: string;
  clinicName: string;
  /** Stable public guide address. Adoption refuses any other slug. */
  publicGuideSlug: string;
}

export const DESIGNATED_DEMOS: readonly DesignatedDemo[] = [
  {
    serviceCategory: "DENTAL",
    clinicSlug: DEMO_AFTERCARE_TENANT_SLUG,
    clinicName: "Rivers Care Demo Clinic",
    publicGuideSlug: "extraction",
  },
  {
    serviceCategory: "PHYSIOTHERAPY",
    clinicSlug: PHYSIO_DEMO_TENANT_SLUG,
    clinicName: "River Physio Demo",
    publicGuideSlug: "home-exercise-plan",
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

export function designatedDemoForClinicSlug(
  clinicSlug: string
): DesignatedDemo | null {
  return (
    DESIGNATED_DEMOS.find((demo) => demo.clinicSlug === clinicSlug) ?? null
  );
}
