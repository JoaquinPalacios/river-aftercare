import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("authenticated guide preview toolbar", () => {
  it("wraps the real patient renderer with staff chrome outside the document", () => {
    const preview = readFileSync(
      "app/(staff)/(guide-preview)/guides/[guideId]/preview/page.tsx",
      "utf8"
    );
    const shell = readFileSync(
      "app/(staff)/(guide-preview)/guides/[guideId]/preview/staff-preview-shell.tsx",
      "utf8"
    );
    const toolbar = readFileSync(
      "app/(staff)/(guide-preview)/guides/[guideId]/preview/staff-preview-toolbar.tsx",
      "utf8"
    );
    const editorPreview = readFileSync(
      "app/(staff)/(clinic-portal)/guides/editor-live-preview.tsx",
      "utf8"
    );
    const publicGuide = readFileSync(
      "app/(aftercare)/%5Fsites/[tenant]/[guideSlug]/page.tsx",
      "utf8"
    );

    expect(toolbar).toContain("aria-label={backLabel}");
    expect(toolbar).toContain("staffPreviewBackLabel");
    expect(toolbar).toContain("Draft preview");
    expect(toolbar).toContain("appearanceControl");
    expect(shell).toContain("PatientPreviewAppearanceSelect");
    expect(shell).toContain('useState<PreviewAppearanceChoice>("portal")');
    expect(editorPreview).toContain(
      'useState<PreviewAppearanceChoice>("portal")'
    );
    expect(preview).toContain("staffPreviewBackLabel");
    expect(preview).toContain("StaffPreviewShell");
    expect(preview).toContain("<PatientPage");
    expect(preview).toContain("showAftercareDisclaimer");
    expect(preview).toContain("GuideDocument");
    expect(preview).toContain('colorSchemeSelector: "scope"');
    expect(shell).toContain("PatientThemeBoundary");
    expect(shell).toContain("StaffPreviewToolbar");
    expect(shell).toContain("resolveEffectivePreviewAppearance");
    expect(shell).toContain("data-preview-theme={previewTheme}");
    expect(shell).toContain("appearance={previewTheme}");
    expect(shell.indexOf("data-preview-theme={previewTheme}")).toBeLessThan(
      shell.indexOf("<StaffPreviewToolbar")
    );
    expect(shell.indexOf("<StaffPreviewToolbar")).toBeLessThan(
      shell.indexOf("<PatientThemeBoundary")
    );
    const staffCss = readFileSync("app/(staff)/staff.css", "utf8");
    expect(staffCss).toContain(
      '.staffPreviewShell[data-preview-theme="light"]'
    );
    expect(staffCss).toContain('.staffPreviewShell[data-preview-theme="dark"]');
    expect(staffCss).not.toContain(
      'html[data-theme-mode="light"] .staffPreviewToolbar'
    );
    expect(staffCss).not.toContain(
      'html[data-theme-mode="dark"] .staffPreviewToolbar'
    );
    expect(preview.lastIndexOf("<StaffPreviewShell")).toBeLessThan(
      preview.lastIndexOf("<PatientPage")
    );
    expect(preview).not.toContain("StaffPreviewToolbar");
    expect(publicGuide).not.toContain("StaffPreviewToolbar");
    expect(publicGuide).not.toContain("Back to guide");
    expect(publicGuide).not.toContain("Draft preview");
    expect(publicGuide).not.toContain("Back to staff");
  });
});
