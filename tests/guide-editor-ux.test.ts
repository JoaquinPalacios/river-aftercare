import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("guide editor UX", () => {
  it("exposes Cancel, Save, and Publish with discard and publish confirmation", () => {
    const editor = readFileSync(
      "app/(staff)/(clinic-portal)/guides/guide-editor.tsx",
      "utf8"
    );

    expect(editor).toContain("Cancel");
    expect(editor).toContain('saving ? "Saving…" : "Save"');
    expect(editor).not.toContain("Save draft");
    expect(editor).toContain("Publish guide");
    expect(editor).toContain("Discard unsaved changes?");
    expect(editor).toContain("Keep editing");
    expect(editor).toContain("Discard changes");
    expect(editor).toContain("Publish this guide?");
    expect(editor).not.toContain("PRACTICE_REVIEW_ATTESTATION_LABEL");
    expect(editor).not.toContain("requiresReviewAttestation");
    expect(editor).not.toContain("reviewAttested");
    expect(editor).not.toContain("Clinical review confirmed by");
    expect(editor).not.toContain("clinically approved");
    expect(editor).not.toContain("I am a clinician");
    expect(editor).toContain("staffEditorToolbar");
    expect(editor).toContain("staffEditorActionsMobile");
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

  it("autosizes guide-content textareas between three and six rows", () => {
    const editor = readFileSync(
      "app/(staff)/(clinic-portal)/guides/guide-editor.tsx",
      "utf8"
    );
    const accordion = readFileSync(
      "app/(staff)/(clinic-portal)/guides/timeline-accordion.tsx",
      "utf8"
    );
    const sharedEditors = readFileSync(
      "app/(staff)/components/guide-section-editors.tsx",
      "utf8"
    );
    const instructionFields = readFileSync(
      "app/(staff)/components/home-care-instruction-fields.tsx",
      "utf8"
    );
    const ordered = readFileSync(
      "app/(staff)/components/ordered-guide-sections-editor.tsx",
      "utf8"
    );
    const staffCss = readFileSync("app/(staff)/staff.css", "utf8");
    const sources = [
      editor,
      accordion,
      sharedEditors,
      instructionFields,
      ordered,
    ];

    for (const source of sources) {
      expect(source).toContain("AutosizeTextarea");
      expect(source).not.toContain("<textarea");
    }

    expect(staffCss).toContain("textarea.staffField {");
    expect(staffCss).toContain("min-height: calc(1.5em * 4 + 1rem)");
    expect(staffCss).toContain("resize: vertical");
    const autosize = staffCss.slice(
      staffCss.indexOf("textarea.staffField.staffAutosizeField {"),
      staffCss.indexOf(".staffSelect {")
    );
    expect(autosize).toContain("min-height: calc(1.5em * 3 + 1rem)");
    expect(autosize).toContain("max-height: calc(1.5em * 6 + 1rem)");
    expect(autosize).toContain("overflow-y: auto");
    expect(autosize).toContain("resize: none");
  });

  it("insets only the sticky editor header with the shared spacing step", () => {
    const staffCss = readFileSync("app/(staff)/staff.css", "utf8");
    const root = staffCss.slice(
      staffCss.indexOf(":root {"),
      staffCss.indexOf('html[data-theme-mode="light"]')
    );
    const toolbar = staffCss.slice(
      staffCss.indexOf(".staffEditorToolbar {"),
      staffCss.indexOf(".staffEditorToolbarStart {")
    );
    const desktop = staffCss.slice(
      staffCss.lastIndexOf(".staffEditorToolbar {"),
      staffCss.indexOf(
        ".staffEditorToolbarStart {",
        staffCss.lastIndexOf(".staffEditorToolbar {")
      )
    );

    expect(root).toContain("--staff-sticky-inset: 0.75rem");
    expect(toolbar).toContain("position: sticky");
    expect(toolbar).toContain("top: env(safe-area-inset-top, 0px)");
    expect(toolbar).toContain("padding-top: var(--staff-sticky-inset)");
    expect(toolbar).toContain(
      "margin-top: calc(0.85rem - var(--staff-sticky-inset))"
    );
    expect(toolbar).toContain("height: env(safe-area-inset-top, 0px)");
    expect(desktop).toContain("padding: var(--staff-sticky-inset) 0 0.7rem");
    expect(desktop).toContain(
      "margin-top: calc(0.8rem - var(--staff-sticky-inset))"
    );
    expect(desktop).not.toContain("top: 0");
  });

  it("shares the mobile editor footer across its page actions", () => {
    const staffCss = readFileSync("app/(staff)/staff.css", "utf8");
    const start = staffCss.indexOf(
      ".staffEditorActionsMobile .staffEditorActions {"
    );
    const block = staffCss.slice(start, staffCss.indexOf(".staffEditorPage {"));

    expect(start).toBeGreaterThan(-1);
    expect(block).toContain("flex-wrap: nowrap");
    expect(block).toContain("width: 100%");
    expect(block).toContain("flex: 1 1 0");
    expect(block).not.toContain("flex-direction: column");
  });
});
