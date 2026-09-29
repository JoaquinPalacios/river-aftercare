import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PortalAppearanceControl } from "@/app/(staff)/components/portal-appearance-control";
import {
  MARKETING_THEME_STORAGE_KEY,
  PATIENT_THEME_STORAGE_KEY,
  PORTAL_THEME_STORAGE_KEY,
} from "@/lib/branding/theme-preference";

describe("portal appearance", () => {
  it("uses a labelled Appearance control instead of a primary nav route", () => {
    const html = renderToStaticMarkup(<PortalAppearanceControl />);

    expect(html).toContain("Appearance");
    expect(html).toContain("colour theme");
    expect(html).toContain("currently System");
    expect(html).toContain('data-tooltip="Appearance"');
    expect(html).not.toContain('href="/appearance"');
    expect(html).not.toContain("ThemeProvider");
  });

  it("keeps portal, marketing, and patient theme storage keys separate", () => {
    expect(PORTAL_THEME_STORAGE_KEY).toBe("aftercare-guide-portal-theme");
    expect(PORTAL_THEME_STORAGE_KEY).not.toBe(MARKETING_THEME_STORAGE_KEY);
    expect(PORTAL_THEME_STORAGE_KEY).not.toBe(PATIENT_THEME_STORAGE_KEY);
    expect(MARKETING_THEME_STORAGE_KEY).not.toBe(PATIENT_THEME_STORAGE_KEY);
  });

  it("does not write portal appearance into ClinicProfile patient theme fields", () => {
    const appearance = readFileSync(
      "app/(staff)/components/portal-appearance-control.tsx",
      "utf8"
    );
    const practice = readFileSync(
      "app/(staff)/(clinic-portal)/practice/practice-settings-form.tsx",
      "utf8"
    );
    const layout = readFileSync("app/(staff)/layout.tsx", "utf8");

    expect(appearance).toContain("PORTAL_THEME_STORAGE_KEY");
    expect(appearance).not.toContain("themeMode");
    expect(appearance).not.toContain("updatePracticeSettings");
    expect(practice).not.toContain("PORTAL_THEME_STORAGE_KEY");
    expect(practice).toContain("themeMode");
    expect(layout).toContain("PORTAL_THEME_STORAGE_KEY");
  });
});
