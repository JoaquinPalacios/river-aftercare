import { describe, expect, it } from "vitest";
import { GuideRevisionStatus } from "@prisma/client";

import {
  classifyCanonicalTemplate,
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
        reviewerName: null,
        reviewRecordedByUserId: null,
      })
    ).toBe(false);
    expect(
      isSamplePublishedRevision({
        status: PUBLISHED,
        reviewedAt: null,
        reviewerName: null,
        reviewRecordedByUserId: null,
      })
    ).toBe(true);
  });

  it("rejects the historical demo seed reviewer label", () => {
    expect(
      isClinicallyReviewedRevision({
        status: PUBLISHED,
        reviewedAt: new Date("2026-08-31"),
        reviewerName: "Care Guide demo seed",
        reviewRecordedByUserId: "operator-1",
      })
    ).toBe(false);
  });

  it("does not treat a reviewer name without a recording operator as complete", () => {
    expect(
      isClinicallyReviewedRevision({
        status: PUBLISHED,
        reviewedAt: new Date("2026-09-01"),
        reviewerName: "Named clinical reviewer",
        reviewRecordedByUserId: null,
      })
    ).toBe(false);
  });

  it("accepts a published revision with named review metadata", () => {
    expect(
      isClinicallyReviewedRevision({
        status: PUBLISHED,
        reviewedAt: new Date("2026-09-01"),
        reviewerName: "Named clinical reviewer",
        reviewRecordedByUserId: "operator-1",
      })
    ).toBe(true);
  });

  it("hides draft-only templates", () => {
    expect(
      classifyCanonicalTemplate({
        isSample: false,
        revisions: [
          {
            id: "draft",
            version: 1,
            status: DRAFT,
            reviewedAt: new Date("2026-09-01"),
            reviewerName: "Named clinical reviewer",
            reviewRecordedByUserId: "operator-1",
          },
        ],
      })
    ).toEqual({ availability: null, eligibleRevisionId: null });
  });

  it("does not infer sample status from missing review metadata on a normal template", () => {
    const classified = classifyCanonicalTemplate({
      isSample: false,
      revisions: [
        {
          id: "v1",
          version: 1,
          status: PUBLISHED,
          reviewedAt: null,
          reviewerName: null,
          reviewRecordedByUserId: null,
        },
      ],
    });
    expect(classified.availability).toBeNull();
    expect(classified.eligibleRevisionId).toBeNull();
    expect(
      clinicCanUseCanonicalTemplate({
        isDemoTenant: true,
        availability: classified.availability,
      })
    ).toBe(false);
    expect(
      clinicCanUseCanonicalTemplate({
        isDemoTenant: false,
        availability: classified.availability,
      })
    ).toBe(false);
  });

  it("keeps explicit sample templates sample even when review fields are populated", () => {
    const classified = classifyCanonicalTemplate({
      isSample: true,
      revisions: [
        {
          id: "v1",
          version: 1,
          status: PUBLISHED,
          reviewedAt: new Date("2026-09-01"),
          reviewerName: "Named clinical reviewer",
          reviewRecordedByUserId: "operator-1",
        },
      ],
    });
    expect(classified).toEqual({
      availability: "sample",
      eligibleRevisionId: "v1",
    });
    expect(
      clinicCanUseCanonicalTemplate({
        isDemoTenant: true,
        availability: classified.availability,
      })
    ).toBe(true);
    expect(
      clinicCanUseCanonicalTemplate({
        isDemoTenant: false,
        availability: classified.availability,
      })
    ).toBe(false);
  });

  it("classifies from the exact latest published revision, not an older reviewed one", () => {
    const mixed = classifyCanonicalTemplate({
      isSample: false,
      revisions: [
        {
          id: "v1",
          version: 1,
          status: PUBLISHED,
          reviewedAt: new Date("2026-09-01"),
          reviewerName: "Named clinical reviewer",
          reviewRecordedByUserId: "operator-1",
        },
        {
          id: "v2",
          version: 2,
          status: PUBLISHED,
          reviewedAt: null,
          reviewerName: null,
          reviewRecordedByUserId: null,
        },
      ],
    });
    expect(mixed.availability).toBeNull();
    expect(mixed.eligibleRevisionId).toBeNull();

    const bothReviewed = classifyCanonicalTemplate({
      isSample: false,
      revisions: [
        {
          id: "v1",
          version: 1,
          status: PUBLISHED,
          reviewedAt: new Date("2026-09-01"),
          reviewerName: "Named clinical reviewer",
          reviewRecordedByUserId: "operator-1",
        },
        {
          id: "v2",
          version: 2,
          status: PUBLISHED,
          reviewedAt: new Date("2026-09-11"),
          reviewerName: "Named clinical reviewer",
          reviewRecordedByUserId: "operator-1",
        },
      ],
    });
    expect(bothReviewed).toEqual({
      availability: "reviewed",
      eligibleRevisionId: "v2",
    });
  });

  it("does not let a draft plus published-unreviewed revision masquerade as reviewed", () => {
    expect(
      classifyCanonicalTemplate({
        isSample: false,
        revisions: [
          {
            id: "draft",
            version: 2,
            status: DRAFT,
            reviewedAt: new Date("2026-09-01"),
            reviewerName: "Named clinical reviewer",
            reviewRecordedByUserId: "operator-1",
          },
          {
            id: "v1",
            version: 1,
            status: PUBLISHED,
            reviewedAt: null,
            reviewerName: null,
            reviewRecordedByUserId: null,
          },
        ],
      }).availability
    ).toBeNull();
  });
});
