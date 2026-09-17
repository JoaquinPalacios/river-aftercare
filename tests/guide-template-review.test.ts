import { describe, expect, it } from "vitest";
import { GuideRevisionStatus } from "@prisma/client";

import {
  classifyCanonicalTemplateAvailability,
  clinicCanUseCanonicalTemplate,
  isClinicallyReviewedRevision,
  isSamplePublishedRevision,
} from "@/lib/aftercare/guide-template-review";

const PUBLISHED = GuideRevisionStatus.PUBLISHED;
const DRAFT = GuideRevisionStatus.DRAFT;

describe("guide template review policy", () => {
  it("does not treat active published revisions as reviewed without named review metadata", () => {
    expect(
      isClinicallyReviewedRevision({
        status: PUBLISHED,
        reviewedAt: null,
        reviewedBy: null,
      })
    ).toBe(false);
    expect(
      isSamplePublishedRevision({
        status: PUBLISHED,
        reviewedAt: null,
        reviewedBy: null,
      })
    ).toBe(true);
  });

  it("rejects the historical demo seed reviewer label", () => {
    expect(
      isClinicallyReviewedRevision({
        status: PUBLISHED,
        reviewedAt: new Date("2026-08-31"),
        reviewedBy: "Care Guide demo seed",
      })
    ).toBe(false);
  });

  it("accepts a published revision with named review metadata", () => {
    expect(
      isClinicallyReviewedRevision({
        status: PUBLISHED,
        reviewedAt: new Date("2026-09-01"),
        reviewedBy: "Named clinical reviewer",
      })
    ).toBe(true);
  });

  it("hides draft-only templates", () => {
    expect(
      classifyCanonicalTemplateAvailability([
        {
          status: DRAFT,
          reviewedAt: new Date("2026-09-01"),
          reviewedBy: "Named clinical reviewer",
        },
      ])
    ).toBeNull();
  });

  it("classifies unreviewed published templates as sample and only allows the demo tenant", () => {
    const availability = classifyCanonicalTemplateAvailability([
      { status: PUBLISHED, reviewedAt: null, reviewedBy: null },
    ]);
    expect(availability).toBe("sample");
    expect(
      clinicCanUseCanonicalTemplate({ isDemoTenant: true, availability })
    ).toBe(true);
    expect(
      clinicCanUseCanonicalTemplate({ isDemoTenant: false, availability })
    ).toBe(false);
  });

  it("does not let a draft plus published-unreviewed revision masquerade as reviewed", () => {
    expect(
      classifyCanonicalTemplateAvailability([
        {
          status: DRAFT,
          reviewedAt: new Date("2026-09-01"),
          reviewedBy: "Named clinical reviewer",
        },
        { status: PUBLISHED, reviewedAt: null, reviewedBy: null },
      ])
    ).toBe("sample");
  });
});
