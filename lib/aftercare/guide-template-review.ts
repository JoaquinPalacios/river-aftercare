import { GuideRevisionStatus } from "@prisma/client";

/**
 * Labels that were written as review metadata but are not clinical review.
 * Seed historically used this string; it must never satisfy the reviewed policy.
 */
export const NON_CLINICAL_REVIEWER_LABELS = new Set(["Care Guide demo seed"]);

export interface GuideRevisionReviewFields {
  status: GuideRevisionStatus | string;
  reviewedAt: Date | null;
  reviewedBy: string | null;
}

function namedClinicalReviewer(reviewedBy: string | null): string | null {
  const reviewer = reviewedBy?.trim() ?? "";
  if (!reviewer || NON_CLINICAL_REVIEWER_LABELS.has(reviewer)) {
    return null;
  }
  return reviewer;
}

/**
 * Platform "reviewed template" policy: a published revision with both
 * `reviewedAt` and a named `reviewedBy` that is not a demo/seed label.
 * Active + PUBLISHED alone is not reviewed.
 */
export function isClinicallyReviewedRevision(
  revision: GuideRevisionReviewFields
): boolean {
  return (
    revision.status === GuideRevisionStatus.PUBLISHED &&
    revision.reviewedAt != null &&
    namedClinicalReviewer(revision.reviewedBy) != null
  );
}

export function isSamplePublishedRevision(
  revision: GuideRevisionReviewFields
): boolean {
  return (
    revision.status === GuideRevisionStatus.PUBLISHED &&
    !isClinicallyReviewedRevision(revision)
  );
}

export type CanonicalTemplateAvailability = "reviewed" | "sample";

export function classifyCanonicalTemplateAvailability(
  revisions: GuideRevisionReviewFields[]
): CanonicalTemplateAvailability | null {
  const publishedRevisions = revisions.filter(
    (revision) => revision.status === GuideRevisionStatus.PUBLISHED
  );
  if (publishedRevisions.length === 0) {
    return null;
  }

  if (publishedRevisions.some(isClinicallyReviewedRevision)) {
    return "reviewed";
  }

  return "sample";
}

export function clinicCanUseCanonicalTemplate(input: {
  isDemoTenant: boolean;
  availability: CanonicalTemplateAvailability | null;
}): boolean {
  if (input.availability === "reviewed") {
    return true;
  }
  return input.availability === "sample" && input.isDemoTenant;
}
