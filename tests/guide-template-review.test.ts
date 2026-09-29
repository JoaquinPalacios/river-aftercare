import { describe, expect, it } from "vitest";

import {
  classifyCanonicalTemplate,
  clinicCanUseCanonicalTemplate,
  latestPublishedRevision,
} from "@/lib/aftercare/guide-template-review";

describe("canonical template eligibility", () => {
  it("hides a template that has no published revision", () => {
    expect(
      classifyCanonicalTemplate({
        isSample: false,
        revisions: [{ id: "draft", version: 1, status: "DRAFT" }],
      })
    ).toEqual({ availability: null, eligibleRevisionId: null });
  });

  it("makes an active production template eligible from its latest published revision", () => {
    const classified = classifyCanonicalTemplate({
      isSample: false,
      revisions: [
        {
          id: "v1",
          version: 1,
          status: "PUBLISHED",
        },
        {
          id: "v2",
          version: 2,
          status: "PUBLISHED",
        },
        {
          id: "draft",
          version: 3,
          status: "DRAFT",
        },
      ],
    });

    expect(classified).toEqual({
      availability: "published",
      eligibleRevisionId: "v2",
    });
    expect(
      clinicCanUseCanonicalTemplate({
        isDemoTenant: false,
        availability: classified.availability,
      })
    ).toBe(true);
    expect(
      clinicCanUseCanonicalTemplate({
        isDemoTenant: true,
        availability: classified.availability,
      })
    ).toBe(true);
  });

  it("does not require review metadata on a published production revision", () => {
    const classified = classifyCanonicalTemplate({
      isSample: false,
      revisions: [
        {
          id: "published",
          version: 1,
          status: "PUBLISHED",
        },
      ],
    });

    expect(classified.availability).toBe("published");
    expect(classified.eligibleRevisionId).toBe("published");
  });

  it("keeps explicit sample templates demo-only", () => {
    const classified = classifyCanonicalTemplate({
      isSample: true,
      revisions: [
        {
          id: "sample",
          version: 1,
          status: "PUBLISHED",
        },
      ],
    });

    expect(classified).toEqual({
      availability: "sample",
      eligibleRevisionId: "sample",
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

  it("pins the latest published revision and ignores an older one", () => {
    const revisions = [
      { id: "old", version: 1, status: "PUBLISHED" as const },
      { id: "new", version: 2, status: "PUBLISHED" as const },
    ];
    expect(latestPublishedRevision(revisions)?.id).toBe("new");
    expect(
      classifyCanonicalTemplate({ isSample: false, revisions })
        .eligibleRevisionId
    ).toBe("new");
  });

  it("does not offer a null availability to any clinic", () => {
    expect(
      clinicCanUseCanonicalTemplate({
        isDemoTenant: true,
        availability: null,
      })
    ).toBe(false);
    expect(
      clinicCanUseCanonicalTemplate({
        isDemoTenant: false,
        availability: null,
      })
    ).toBe(false);
  });
});
