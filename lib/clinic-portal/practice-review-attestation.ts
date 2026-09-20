/**
 * Clinic confirmation that practice-owned content has undergone the
 * practice's required clinical review before publication.
 *
 * This is not River Aftercare clinical approval. The authenticated Clinic
 * ADMIN confirms on behalf of the practice; they are not recorded as the
 * clinical reviewer unless they actually are one.
 */
export const PRACTICE_REVIEW_ATTESTATION_LABEL =
  "I confirm this content has been reviewed and approved by the practice for publication to its patients.";

export const PRACTICE_REVIEW_ATTESTATION_REQUIRED_MESSAGE =
  "Confirm that the practice has reviewed and approved this content before publishing.";

export const FALLBACK_CLINIC_ACTOR_LABEL = "Clinic admin";

export function isPracticeReviewAttested(value: unknown): boolean {
  return value === true || value === "true" || value === "on" || value === "1";
}

export function clinicActorLabel(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed || FALLBACK_CLINIC_ACTOR_LABEL;
}
