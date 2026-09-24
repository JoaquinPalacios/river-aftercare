import { describe, expect, it } from "vitest";

import { GuideRevisionStatus, PracticeGuideStatus } from "@prisma/client";

import {
  clinicGuideCanUnpublish,
  clinicGuideDestructiveAction,
  clinicGuideLifecycleStatus,
  clinicGuideStatusLabel,
  clinicGuideStatusPills,
  guideEditorPublicationMode,
} from "@/lib/clinic-portal/guide-status";

describe("guide status pills", () => {
  it("splits published drafts into distinct Published and Draft changes pills", () => {
    expect(clinicGuideStatusPills("published_draft_changes")).toEqual([
      { label: "Published", tone: "published" },
      { label: "Draft changes", tone: "changes" },
    ]);
    expect(clinicGuideStatusLabel("published_draft_changes")).toBe(
      "Published · Draft changes"
    );
    expect(clinicGuideStatusPills("draft")).toEqual([
      { label: "Draft", tone: "draft" },
    ]);
    expect(clinicGuideStatusPills("unpublished")).toEqual([
      { label: "Unpublished", tone: "unpublished" },
    ]);
    expect(clinicGuideStatusPills("published")).toEqual([
      { label: "Published", tone: "published" },
    ]);
  });

  it("offers delete for drafts and unpublished guides, discard for published draft changes", () => {
    expect(clinicGuideDestructiveAction("draft")).toBe("delete_guide");
    expect(clinicGuideDestructiveAction("unpublished")).toBe("delete_guide");
    expect(clinicGuideDestructiveAction("published_draft_changes")).toBe(
      "discard_draft_changes"
    );
    expect(clinicGuideDestructiveAction("published")).toBeNull();
    expect(clinicGuideDestructiveAction("published_disabled")).toBeNull();
  });

  it("shows Publish for drafts and Unpublish for a clean published guide", () => {
    expect(
      guideEditorPublicationMode({ lifecycle: "draft", dirty: false })
    ).toEqual({ publish: true, unpublish: false });
    expect(
      guideEditorPublicationMode({ lifecycle: "unpublished", dirty: false })
    ).toEqual({ publish: true, unpublish: false });
    expect(
      guideEditorPublicationMode({ lifecycle: "published", dirty: false })
    ).toEqual({ publish: false, unpublish: true });
    expect(
      guideEditorPublicationMode({ lifecycle: "published", dirty: true })
    ).toEqual({ publish: true, unpublish: true });
    expect(
      guideEditorPublicationMode({
        lifecycle: "published_draft_changes",
        dirty: false,
      })
    ).toEqual({ publish: true, unpublish: true });
    expect(
      guideEditorPublicationMode({
        lifecycle: "published_disabled",
        dirty: false,
      })
    ).toEqual({ publish: true, unpublish: true });
  });

  it("offers unpublish for currently public pins only", () => {
    expect(clinicGuideCanUnpublish("published")).toBe(true);
    expect(clinicGuideCanUnpublish("published_draft_changes")).toBe(true);
    expect(clinicGuideCanUnpublish("published_disabled")).toBe(true);
    expect(clinicGuideCanUnpublish("draft")).toBe(false);
    expect(clinicGuideCanUnpublish("unpublished")).toBe(false);
  });

  it("maps UNPUBLISHED status to the unpublished lifecycle", () => {
    expect(
      clinicGuideLifecycleStatus({
        status: PracticeGuideStatus.UNPUBLISHED,
        isEnabled: false,
        publishedRevisionStatus: GuideRevisionStatus.PUBLISHED,
        draftUpdatedAt: new Date("2026-09-12"),
        publishedAt: new Date("2026-09-11"),
      })
    ).toBe("unpublished");
  });
});
