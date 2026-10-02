import type { ServiceCategory } from "@prisma/client";

import { DEMO_AFTERCARE_TENANT_SLUG } from "@/lib/aftercare/demo-tenant";
import { SHARED_DEMO_DISPLAY_NAME } from "@/lib/dev/shared-demo-brand";

/**
 * One shared demonstration account serves every service category.
 * Each category has its own canonical sample slug and public guide slug.
 * Chiropractic and Cosmetic & Aesthetic identities are reserved for when
 * those samples exist. Seed and provisioning do not create their guides.
 */
export interface DesignatedDemo {
  serviceCategory: ServiceCategory;
  clinicSlug: string;
  clinicName: string;
  /** Canonical GuideTemplate.slug. Adoption refuses any other sample. */
  sampleSlug: string;
  /** Stable public guide address. Adoption refuses any other slug. */
  publicGuideSlug: string;
  /**
   * Local seed may create this practice guide. False means the identity is
   * recorded only; no placeholder guide is created.
   */
  seedPracticeGuide: boolean;
}

export const DESIGNATED_DEMOS: readonly DesignatedDemo[] = [
  {
    serviceCategory: "DENTAL",
    clinicSlug: DEMO_AFTERCARE_TENANT_SLUG,
    clinicName: SHARED_DEMO_DISPLAY_NAME,
    sampleSlug: "extraction",
    publicGuideSlug: "extraction",
    seedPracticeGuide: true,
  },
  {
    serviceCategory: "PHYSIOTHERAPY",
    clinicSlug: DEMO_AFTERCARE_TENANT_SLUG,
    clinicName: SHARED_DEMO_DISPLAY_NAME,
    sampleSlug: "home-exercise-plan",
    publicGuideSlug: "home-exercise-plan",
    seedPracticeGuide: true,
  },
  {
    serviceCategory: "CHIROPRACTIC",
    clinicSlug: DEMO_AFTERCARE_TENANT_SLUG,
    clinicName: SHARED_DEMO_DISPLAY_NAME,
    sampleSlug: "chiropractic-adjustment",
    publicGuideSlug: "chiropractic-adjustment",
    seedPracticeGuide: false,
  },
  {
    serviceCategory: "COSMETIC_AESTHETIC",
    clinicSlug: DEMO_AFTERCARE_TENANT_SLUG,
    clinicName: SHARED_DEMO_DISPLAY_NAME,
    sampleSlug: "superficial-chemical-peel",
    publicGuideSlug: "superficial-chemical-peel",
    seedPracticeGuide: false,
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

export function designatedDemosForClinicSlug(
  clinicSlug: string
): readonly DesignatedDemo[] {
  return DESIGNATED_DEMOS.filter((demo) => demo.clinicSlug === clinicSlug);
}

/**
 * A sample may update the shared demo only when the account, category,
 * canonical sample slug, and public guide slug are the designated set.
 * Sharing the account is not enough.
 */
export function designatedDemoAcceptsTemplate(input: {
  clinicSlug: string;
  serviceCategory: ServiceCategory;
  templateSlug: string;
}): DesignatedDemo | null {
  const designation = designatedDemoForCategory(input.serviceCategory);
  if (
    !designation ||
    designation.clinicSlug !== input.clinicSlug ||
    designation.sampleSlug !== input.templateSlug
  ) {
    return null;
  }
  return designation;
}
