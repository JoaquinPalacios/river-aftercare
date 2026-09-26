import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const interaction = readFileSync("app/interaction.css", "utf8");
const marketing = readFileSync("app/(marketing)/marketing.css", "utf8");
const marketingModule = readFileSync(
  "app/(marketing)/marketing.module.css",
  "utf8"
);
const staff = readFileSync("app/(staff)/staff.css", "utf8");
const aftercare = readFileSync("app/(aftercare)/aftercare.css", "utf8");
const patient = readFileSync("app/(aftercare)/patient.module.css", "utf8");

describe("interaction system", () => {
  it("centralises duration and easing without a UI library", () => {
    expect(interaction).toContain("--interaction-duration: 150ms");
    expect(interaction).toContain("--interaction-easing: ease");
    expect(interaction).toContain("prefers-reduced-motion");
    expect(marketing).toContain('@import "../interaction.css"');
    expect(staff).toContain('@import "../interaction.css"');
    expect(aftercare).toContain('@import "../interaction.css"');
    expect(staff).toContain('@import "tailwindcss"');
    expect(aftercare).not.toContain("tailwind");
    expect(marketing).not.toContain("tailwind");
    expect(patient).not.toContain("tailwind");
  });

  it("keeps primary, secondary, quiet, and nav controls geometrically still", () => {
    expect(marketingModule).not.toMatch(/\.primary:hover[^{]*\{[^}]*transform/);
    expect(marketingModule).not.toMatch(
      /\.primary:active[^{]*\{[^}]*transform/
    );
    expect(marketingModule).not.toContain("translateY(-1px)");
    expect(staff).not.toContain("translateY(0.5px)");
    expect(staff).not.toMatch(/\.staffBtn[^{]*\{[^}]*transform/);
    expect(patient).not.toContain("translateX(2px)");
    expect(patient).not.toMatch(/\.primary:hover[^{]*\{[^}]*transform/);
    expect(patient).not.toMatch(/\.action[^{]*\{[^}]*transform/);
  });

  it("uses explicit theme hex instead of light-dark for staff semantic tokens", () => {
    expect(staff).toContain('html[data-theme-mode="dark"]');
    expect(staff).toContain("--staff-ink: #f3f4f8");
    expect(staff).toContain("--staff-muted: #a8b2c2");
    expect(staff).toContain(
      'html[data-theme-mode="dark"] .staffNavRow[aria-current]'
    );
    expect(staff).not.toMatch(/--staff-ink:\s*light-dark\(/);
    expect(staff).not.toMatch(/--staff-brand:\s*light-dark\(/);
    expect(staff).toContain('.staffPreviewShell[data-preview-theme="dark"]');
    expect(staff).toContain("--staff-muted: #a8b2c2");
  });

  it("uses semantic control classes and hover-capable media", () => {
    expect(marketingModule).toContain(".primary:hover:not(:disabled)");
    expect(marketingModule).toContain(".secondary:hover");
    expect(staff).toContain(".staffBtnPrimary:hover:not(:disabled)");
    expect(staff).toContain(".staffBtnSecondary:hover:not(:disabled)");
    expect(staff).toContain(".staffBtnQuiet:hover:not(:disabled)");
    expect(staff).toContain(".staffNavRow[aria-current]");
    expect(staff).toContain(".staffPreviewBack:hover");
    expect(patient).toContain(".primary:hover:not(:disabled)");
    expect(patient).toContain(".secondary:hover:not(:disabled)");
    expect(marketingModule).toContain(
      "@media (hover: hover) and (pointer: fine)"
    );
    expect(staff).toContain("@media (hover: hover) and (pointer: fine)");
    expect(patient).toContain("@media (hover: hover) and (pointer: fine)");
  });

  it("keeps focus-visible distinct from hover", () => {
    expect(marketingModule).toContain(".primary:focus-visible");
    expect(marketingModule).toContain(".secondary:focus-visible");
    expect(staff).toContain(".staffBtn:focus-visible");
    expect(staff).toContain(".staffNavRow:focus-visible");
    expect(staff).toContain(".staffPreviewBack:focus-visible");
    expect(aftercare).toContain(".aftercareTheme :focus-visible");
    expect(patient).not.toMatch(
      /\.secondary:hover,\s*\.secondary:focus-visible/
    );
    expect(staff).not.toMatch(
      /\.staffOverflowItem:hover,\s*\.staffOverflowItem:focus-visible/
    );
  });

  it("keeps sidebar current, hover, and focus-visible visually distinct", () => {
    const hover = staff.match(/\.staffNavRow:hover\s*\{[^}]*\}/)?.[0] ?? "";
    const current =
      staff.match(/\.staffNavRow\[aria-current\]\s*\{[^}]*\}/)?.[0] ?? "";
    const focus =
      staff.match(/\.staffNavRow:focus-visible\s*\{[^}]*\}/)?.[0] ?? "";

    expect(hover).toContain(
      "color-mix(in srgb, var(--staff-line) 65%, var(--staff-panel))"
    );
    expect(hover).not.toContain("#eef0fb");
    expect(hover).not.toContain("#3b4bd1");
    expect(current).toContain("background:");
    expect(current).toContain("color:");
    expect(current).toContain("#eef0fb");
    expect(current).toContain("#3b4bd1");
    expect(focus).toContain("outline:");
    expect(focus).not.toContain("background:");
    expect(staff).not.toMatch(/\.staffNavRow:focus\s*\{/);
    expect(staff).toContain("@media (hover: hover) and (pointer: fine)");
  });
});
