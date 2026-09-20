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

export interface CanonicalRevisionCandidate extends GuideRevisionReviewFields {
  id: string;
  version: number;
}

export interface CanonicalTemplateClassification {
  availability: CanonicalTemplateAvailability | null;
  eligibleRevisionId: string | null;
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
 * exact latest published revision. Do not infer sample status from missing
 * review metadata, and do not classify on one revision while pinning another.
 *
 * - isSample=true → sample/demo only, even if review fields are populated.
 * - isSample=false → the latest published revision must itself be reviewed
 *   before a normal clinic may enable it. An older reviewed revision cannot
 *   make a newer unreviewed published revision eligible.
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

  if (isClinicallyReviewedRevision(latest)) {
    return {
      availability: "reviewed",
      eligibleRevisionId: latest.id,
    };
  }

  return { availability: null, eligibleRevisionId: null };
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
