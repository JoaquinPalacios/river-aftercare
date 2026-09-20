import { describe, expect, it } from "vitest";

import {
  MARKETING_THEME_STORAGE_KEY,
  PATIENT_THEME_STORAGE_KEY,
  PORTAL_THEME_STORAGE_KEY,
  PRODUCT_THEME_COOKIE_NAME,
  parseThemeMode,
  parseThemePreference,
  productThemeCookieDomain,
  themePreferenceBootstrapScript,
} from "@/lib/branding/theme-preference";

describe("theme preference", () => {
  it("parses clinic LIGHT, DARK, and SYSTEM policies", () => {
    expect(parseThemeMode("LIGHT")).toBe("LIGHT");
    expect(parseThemeMode("DARK")).toBe("DARK");
    expect(parseThemeMode("SYSTEM")).toBe("SYSTEM");
    expect(parseThemeMode(" system ")).toBe("SYSTEM");
  });

  it("defaults missing or unsafe clinic theme modes to SYSTEM", () => {
    expect(parseThemeMode(null)).toBe("SYSTEM");
    expect(parseThemeMode("PURPLE")).toBe("SYSTEM");
    expect(parseThemeMode("color:red")).toBe("SYSTEM");
  });

  it("parses explicit stored preferences and rejects anything else", () => {
    expect(parseThemePreference("system")).toBe("system");
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("LIGHT")).toBeNull();
    expect(parseThemePreference("javascript:alert(1)")).toBeNull();
    expect(parseThemePreference(null)).toBeNull();
  });

  it("emits a blocking bootstrap script that only writes a safe data attribute", () => {
    const script = themePreferenceBootstrapScript(PATIENT_THEME_STORAGE_KEY);

    expect(script).toContain(PATIENT_THEME_STORAGE_KEY);
    expect(script).toContain("localStorage.getItem");
    expect(script).toContain("data-theme-mode");
    expect(script).not.toContain("ThemeProvider");
    expect(script).not.toContain("<");
    expect(MARKETING_THEME_STORAGE_KEY).not.toBe(PATIENT_THEME_STORAGE_KEY);
    expect(PORTAL_THEME_STORAGE_KEY).toBe("aftercare-guide-portal-theme");
    expect(PORTAL_THEME_STORAGE_KEY).not.toBe(MARKETING_THEME_STORAGE_KEY);
    expect(PORTAL_THEME_STORAGE_KEY).not.toBe(PATIENT_THEME_STORAGE_KEY);
  });

  it("keeps product theme cookies on the platform root, including localhost", () => {
    expect(PRODUCT_THEME_COOKIE_NAME).toBe("aftercare-guide-ui-theme");
    expect(productThemeCookieDomain("localhost")).toBe(".localhost");
    expect(productThemeCookieDomain("riveraftercare.com.au")).toBe(
      ".riveraftercare.com.au"
    );
  });

  it("lets staff bootstrap fall back to marketing storage, cookie, then system", () => {
    const script = themePreferenceBootstrapScript(PORTAL_THEME_STORAGE_KEY, {
      fallbackStorageKey: MARKETING_THEME_STORAGE_KEY,
      cookieName: PRODUCT_THEME_COOKIE_NAME,
      defaultPreference: "system",
    });

    expect(script).toContain(PORTAL_THEME_STORAGE_KEY);
    expect(script).toContain(MARKETING_THEME_STORAGE_KEY);
    expect(script).toContain(PRODUCT_THEME_COOKIE_NAME);
    expect(script).toContain("document.cookie");
    expect(script).toContain('"system"');
    expect(script).not.toContain("<");
    expect(script).not.toContain("ThemeProvider");
  });
});
