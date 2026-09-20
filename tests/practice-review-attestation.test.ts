import { describe, expect, it } from "vitest";

import {
  clinicActorLabel,
  FALLBACK_CLINIC_ACTOR_LABEL,
  isPracticeReviewAttested,
  PRACTICE_REVIEW_ATTESTATION_LABEL,
} from "@/lib/clinic-portal/practice-review-attestation";

describe("practice review attestation helpers", () => {
  it("accepts only explicit true-like values", () => {
    expect(isPracticeReviewAttested(true)).toBe(true);
    expect(isPracticeReviewAttested("true")).toBe(true);
    expect(isPracticeReviewAttested("on")).toBe(true);
    expect(isPracticeReviewAttested("1")).toBe(true);
    expect(isPracticeReviewAttested(false)).toBe(false);
    expect(isPracticeReviewAttested("false")).toBe(false);
    expect(isPracticeReviewAttested(null)).toBe(false);
    expect(isPracticeReviewAttested(undefined)).toBe(false);
    expect(isPracticeReviewAttested("")).toBe(false);
  });

  it("uses a safe clinic-admin label instead of email when the name is missing", () => {
    expect(clinicActorLabel("Joaquín Palacios")).toBe("Joaquín Palacios");
    expect(clinicActorLabel("  ")).toBe(FALLBACK_CLINIC_ACTOR_LABEL);
    expect(clinicActorLabel(null)).toBe(FALLBACK_CLINIC_ACTOR_LABEL);
    expect(PRACTICE_REVIEW_ATTESTATION_LABEL).toContain(
      "reviewed and approved by the practice"
    );
    expect(PRACTICE_REVIEW_ATTESTATION_LABEL).not.toContain("clinician");
    expect(PRACTICE_REVIEW_ATTESTATION_LABEL).not.toContain("River Aftercare");
  });
});
