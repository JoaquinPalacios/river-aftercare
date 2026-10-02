import { GuideRevisionStatus, type ServiceCategory } from "@prisma/client";

import { designatedDemoForCategory } from "@/lib/demo-adoption/designated-demos";

export interface CanonicalRevisionCandidate {
  id: string;
  version: number;
  status: GuideRevisionStatus | string;
}

export interface CanonicalTemplateClassification {
  availability: CanonicalTemplateAvailability | null;
  eligibleRevisionId: string | null;
}

/**
 * `published` is an active production template's latest published revision.
 * `sample` is explicit demo content (`GuideTemplate.isSample`).
 * Review metadata is not part of either classification.
 */
export type CanonicalTemplateAvailability = "published" | "sample";

export function latestPublishedRevision<
  T extends { status: GuideRevisionStatus | string; version: number },
>(revisions: T[]): T | null {
  let latest: T | null = null;
  for (const revision of revisions) {
    if (revision.status !== GuideRevisionStatus.PUBLISHED) {
      continue;
    }
    if (!latest || revision.version > latest.version) {
      latest = revision;
    }
  }
  return latest;
}

/**
 * Classify a canonical template from its explicit sample designation plus the
 * exact latest published revision. Drafts are never eligible. Review metadata
 * is ignored. Do not infer sample status from missing review fields, and do
 * not classify on one revision while pinning another.
 *
 * - no published revision → not eligible
 * - isSample=true → sample/demo only, even if historical review fields exist
 * - isSample=false → the latest published revision is eligible
 */
export function classifyCanonicalTemplate(input: {
  isSample: boolean;
  revisions: CanonicalRevisionCandidate[];
}): CanonicalTemplateClassification {
  const latest = latestPublishedRevision(input.revisions);
  if (!latest) {
    return { availability: null, eligibleRevisionId: null };
  }

  if (input.isSample) {
    return {
      availability: "sample",
      eligibleRevisionId: latest.id,
    };
  }

  return {
    availability: "published",
    eligibleRevisionId: latest.id,
  };
}

/**
 * Production templates are available to any clinic whose site includes the
 * category. A sample is available only to the designated demo for that
 * category. Being a demo account does not open every sample.
 */
export function clinicCanUseCanonicalTemplate(input: {
  clinicSlug: string;
  serviceCategory: ServiceCategory;
  availability: CanonicalTemplateAvailability | null;
}): boolean {
  if (input.availability === "published") {
    return true;
  }
  if (input.availability !== "sample") {
    return false;
  }
  return (
    designatedDemoForCategory(input.serviceCategory)?.clinicSlug ===
    input.clinicSlug
  );
}
