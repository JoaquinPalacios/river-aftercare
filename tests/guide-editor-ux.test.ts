import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("guide editor UX", () => {
  it("exposes Cancel, Save draft, and Publish with discard and publish confirmation", () => {
    const editor = readFileSync(
      "app/(staff)/(clinic-portal)/guides/guide-editor.tsx",
      "utf8"
    );

    expect(editor).toContain("Cancel");
    expect(editor).toContain("Save draft");
    expect(editor).toContain("Publish guide");
    expect(editor).toContain("Discard unsaved changes?");
    expect(editor).toContain("Keep editing");
    expect(editor).toContain("Discard changes");
    expect(editor).toContain("Publish this guide?");
    expect(editor).toContain("PRACTICE_REVIEW_ATTESTATION_LABEL");
    expect(editor).toContain("requiresReviewAttestation");
    expect(editor).toContain("reviewAttested");
    expect(editor).toContain("Clinical review confirmed by");
    expect(editor).not.toContain("clinically approved");
    expect(editor).not.toContain("I am a clinician");
    expect(editor).toContain("staffEditorToolbar");
    expect(editor).toContain("staffEditorRail");
    expect(editor).toContain("staffGuideEditor");
    expect(editor).toContain("staffEditorRailDesktop");
    expect(editor).toContain("staffEditorRailMobile");
    expect(editor).not.toContain("staffEditorChrome");
    expect(editor).not.toContain("staffEditorRailCard");
    expect(editor).not.toContain("lg:grid-cols");
    expect(editor).not.toContain("lg:block");
    expect(editor).not.toContain("max-w-6xl");
    expect(editor).toContain("useUnsavedChangesGuard");
    expect(editor).toContain("formSaveStatus");
    expect(editor).toContain("EditorLivePreview");
    expect(editor).toContain("TimelineAccordion");
    expect(editor).not.toContain("window.confirm");
    expect(editor).toContain("slugLocked");
    expect(editor).toContain('<input type="hidden" name="publicSlug"');
    expect(editor).toContain("ignoreNextServerSnapshot");
  });

  it("gives guide-content textareas at least four rows", () => {
    const editor = readFileSync(
      "app/(staff)/(clinic-portal)/guides/guide-editor.tsx",
      "utf8"
    );
    const accordion = readFileSync(
      "app/(staff)/(clinic-portal)/guides/timeline-accordion.tsx",
      "utf8"
    );
    const staffCss = readFileSync("app/(staff)/staff.css", "utf8");
    const chunks = `${editor}\n${accordion}`.split("<textarea").slice(1);

    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const chunk of chunks) {
      const rows = chunk.match(/rows=\{(\d+)\}/);
      expect(Number(rows?.[1] ?? 0)).toBeGreaterThanOrEqual(4);
      expect(chunk).toContain('className="staffField"');
    }

    expect(staffCss).toContain("textarea.staffField");
    expect(staffCss).toContain("min-height: calc(1.5em * 4 + 1rem)");
    expect(staffCss).toContain("resize: vertical");
  });
});
