import { describe, expect, it } from "vitest";

import {
  bulkTemplateActionAvailability,
  type BulkTemplateRow,
} from "@/lib/operator/canonical-templates/bulk-template-eligibility";

function row(
  overrides: Partial<BulkTemplateRow> & Pick<BulkTemplateRow, "id" | "title">
): BulkTemplateRow {
  return {
    serviceCategory: "DENTAL",
    isActive: true,
    isSample: false,
    latestPublishedVersion: null,
    draft: { id: `${overrides.id}-draft`, version: 1 },
    ...overrides,
  };
}

describe("canonical template bulk eligibility", () => {
  it("enables publish, deactivate, and delete for active unpublished drafts", () => {
    const availability = bulkTemplateActionAvailability([
      row({ id: "a", title: "Alpha" }),
      row({ id: "b", title: "Beta" }),
    ]);
    expect(availability.publish).toEqual({ enabled: true, reason: null });
    expect(availability.deactivate).toEqual({ enabled: true, reason: null });
    expect(availability.delete).toEqual({ enabled: true, reason: null });
    expect(availability.reactivate.enabled).toBe(false);
    expect(availability.reactivate.reason).toContain("already active");
  });

  it("uses the same structural rules for an editable sample", () => {
    const availability = bulkTemplateActionAvailability([
      row({
        id: "sample",
        title: "Tooth Extraction",
        isSample: true,
        latestPublishedVersion: 1,
        draft: { id: "sample-draft", version: 2 },
      }),
    ]);
    expect(availability.publish).toEqual({ enabled: true, reason: null });
    expect(availability.deactivate).toEqual({ enabled: true, reason: null });
    expect(availability.reactivate.enabled).toBe(false);
    expect(availability.delete.enabled).toBe(false);
    expect(availability.delete.reason).toContain("published revision");
  });

  it("rejects reactivating two samples in the same category", () => {
    const availability = bulkTemplateActionAvailability([
      row({
        id: "old",
        title: "Previous physio sample",
        serviceCategory: "PHYSIOTHERAPY",
        isSample: true,
        isActive: false,
        latestPublishedVersion: 1,
        draft: null,
      }),
      row({
        id: "next",
        title: "Replacement physio sample",
        serviceCategory: "PHYSIOTHERAPY",
        isSample: true,
        isActive: false,
        latestPublishedVersion: 1,
        draft: null,
      }),
    ]);
    expect(availability.reactivate.enabled).toBe(false);
    expect(availability.reactivate.reason).toContain(
      "Physiotherapy would have more than one active sample"
    );
  });

  it("fails closed when any selected template cannot be published or deleted", () => {
    const availability = bulkTemplateActionAvailability([
      row({ id: "ready", title: "Ready" }),
      row({ id: "closed", title: "Closed", draft: null }),
      row({
        id: "published",
        title: "Published",
        latestPublishedVersion: 2,
        draft: { id: "published-draft", version: 3 },
      }),
    ]);
    expect(availability.publish.enabled).toBe(false);
    expect(availability.publish.reason).toBe(
      "Publish unavailable — 1 selected template has no open draft."
    );
    expect(availability.delete.enabled).toBe(false);
    expect(availability.delete.reason).toBe(
      "Delete unavailable — 1 selected template has no open draft and 1 selected template has a published revision."
    );
  });

  it("counts every distinct blocker without enabling a partial action", () => {
    const availability = bulkTemplateActionAvailability([
      row({ id: "sample", title: "Sample", isSample: true, draft: null }),
      row({ id: "paused", title: "Paused", isActive: false }),
      row({
        id: "history",
        title: "History",
        latestPublishedVersion: 1,
        draft: null,
      }),
    ]);
    expect(availability.publish.enabled).toBe(false);
    expect(availability.publish.reason).toBe(
      "Publish unavailable — 2 selected templates have no open draft and 1 selected template is inactive."
    );
    expect(availability.delete.enabled).toBe(false);
    expect(availability.delete.reason).toContain(
      "1 selected template has no open draft"
    );
    expect(availability.delete.reason).toContain(
      "1 selected template has a published revision"
    );
    expect(availability.deactivate.enabled).toBe(false);
    expect(availability.reactivate.enabled).toBe(false);
  });

  it("enables reactivate only for inactive production templates", () => {
    const availability = bulkTemplateActionAvailability([
      row({
        id: "paused",
        title: "Paused",
        isActive: false,
        latestPublishedVersion: 1,
        draft: null,
      }),
    ]);
    expect(availability.reactivate).toEqual({ enabled: true, reason: null });
    expect(availability.deactivate.enabled).toBe(false);
    expect(availability.deactivate.reason).toContain("already inactive");
    expect(availability.delete.enabled).toBe(false);
  });
});
