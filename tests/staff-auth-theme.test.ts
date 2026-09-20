/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

import {
  MARKETING_THEME_STORAGE_KEY,
  PORTAL_THEME_STORAGE_KEY,
  PRODUCT_THEME_COOKIE_NAME,
  persistProductThemeCookie,
  themePreferenceBootstrapScript,
} from "@/lib/branding/theme-preference";

const staffCss = readFileSync("app/(staff)/staff.css", "utf8");
const staffLayout = readFileSync("app/(staff)/layout.tsx", "utf8");
const authShell = readFileSync(
  "app/(staff)/components/staff-auth-shell.tsx",
  "utf8"
);
const loginForm = readFileSync("app/(staff)/login/login-form.tsx", "utf8");
const forgotForm = readFileSync(
  "app/(staff)/forgot-password/forgot-password-form.tsx",
  "utf8"
);

function runBootstrap(
  options: Parameters<typeof themePreferenceBootstrapScript>[1]
) {
  const script = themePreferenceBootstrapScript(
    PORTAL_THEME_STORAGE_KEY,
    options
  );
  window.eval(script);
}

describe("staff auth theming", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme-mode");
    document.documentElement.removeAttribute("data-theme-cookie-domain");
    window.localStorage.clear();
    document.cookie.split(";").forEach((part) => {
      const name = part.split("=")[0]?.trim();
      if (name) {
        document.cookie = `${name}=; Max-Age=0; Path=/`;
      }
    });
  });

  it("defaults staff auth to system when nothing is stored", () => {
    runBootstrap({
      fallbackStorageKey: MARKETING_THEME_STORAGE_KEY,
      cookieName: PRODUCT_THEME_COOKIE_NAME,
      defaultPreference: "system",
    });

    expect(document.documentElement.getAttribute("data-theme-mode")).toBe(
      "system"
    );
  });

  it("prefers an explicit portal preference over OS and marketing", () => {
    window.localStorage.setItem(PORTAL_THEME_STORAGE_KEY, "light");
    window.localStorage.setItem(MARKETING_THEME_STORAGE_KEY, "dark");
    document.cookie = `${PRODUCT_THEME_COOKIE_NAME}=dark; Path=/`;

    runBootstrap({
      fallbackStorageKey: MARKETING_THEME_STORAGE_KEY,
      cookieName: PRODUCT_THEME_COOKIE_NAME,
      defaultPreference: "system",
    });

    expect(document.documentElement.getAttribute("data-theme-mode")).toBe(
      "light"
    );
  });

  it("uses the shared product cookie when portal storage is empty", () => {
    document.cookie = `${PRODUCT_THEME_COOKIE_NAME}=dark; Path=/`;

    runBootstrap({
      fallbackStorageKey: MARKETING_THEME_STORAGE_KEY,
      cookieName: PRODUCT_THEME_COOKIE_NAME,
      defaultPreference: "system",
    });

    expect(document.documentElement.getAttribute("data-theme-mode")).toBe(
      "dark"
    );
  });

  it("writes a product cookie that bootstrap can read on a later visit", async () => {
    document.documentElement.setAttribute(
      "data-theme-cookie-domain",
      ".localhost"
    );
    await persistProductThemeCookie("dark");

    expect(document.cookie).toContain(`${PRODUCT_THEME_COOKIE_NAME}=dark`);
  });

  it("keeps auth surfaces on staff tokens instead of hardcoded light reds", () => {
    expect(staffLayout).toContain("PRODUCT_THEME_COOKIE_NAME");
    expect(staffLayout).toContain('defaultPreference: "system"');
    expect(authShell).toContain("staffAuthPage");
    expect(authShell).toContain("staffAuthCard");
    expect(loginForm).toContain("staffFieldError");
    expect(loginForm).toContain("staffFormAlert");
    expect(loginForm).not.toContain("text-red-600");
    expect(forgotForm).toContain("staffFormAlert");
    expect(staffCss).toContain(".staffAuthCard");
    expect(staffCss).toContain(".staffLoginField:-webkit-autofill");
    expect(staffCss).toContain('html[data-theme-mode="dark"] .staffLoginField');
    expect(staffCss).toContain(".staffFieldError");
    expect(staffCss).toContain("var(--staff-danger)");
    expect(staffCss).toContain("var(--staff-canvas)");
    expect(staffCss).not.toContain("#fef2f2");
  });
});
