import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PracticeMark } from "@/app/(aftercare)/components/practice-mark";
import {
  clinicLogoSrcForAppearance,
  resolvePatientThemeLogos,
} from "@/lib/branding/clinic-logo-theme";

const STANDARD = "/clinic-branding/clinic_a/standard.png";
const DARK = "/clinic-branding/clinic_a/dark.png";

describe("resolvePatientThemeLogos", () => {
  it("keeps the standard logo in dark theme when no dark logo exists", () => {
    expect(
      resolvePatientThemeLogos({ logoSrc: STANDARD, darkLogoSrc: null })
    ).toEqual({ lightSrc: STANDARD, darkSrc: null });
  });

  it("uses the standard logo in light theme even when a dark logo exists", () => {
    expect(
      resolvePatientThemeLogos({ logoSrc: STANDARD, darkLogoSrc: DARK })
    ).toEqual({ lightSrc: STANDARD, darkSrc: DARK });
  });

  it("keeps a dark-only upload as the single patient mark", () => {
    expect(
      resolvePatientThemeLogos({ logoSrc: null, darkLogoSrc: DARK })
    ).toEqual({ lightSrc: DARK, darkSrc: null });
  });

  it("returns no mark when neither logo exists", () => {
    expect(
      resolvePatientThemeLogos({ logoSrc: null, darkLogoSrc: null })
    ).toEqual({ lightSrc: null, darkSrc: null });
    expect(
      resolvePatientThemeLogos({ logoSrc: "  ", darkLogoSrc: "" })
    ).toEqual({ lightSrc: null, darkSrc: null });
  });

  it("does not add a second image when both urls are the same file", () => {
    expect(
      resolvePatientThemeLogos({ logoSrc: STANDARD, darkLogoSrc: STANDARD })
    ).toEqual({ lightSrc: STANDARD, darkSrc: null });
  });
});

describe("clinicLogoSrcForAppearance", () => {
  it.each([
    ["light", STANDARD, null, STANDARD],
    ["light", STANDARD, DARK, STANDARD],
    ["dark", STANDARD, null, STANDARD],
    ["dark", STANDARD, DARK, DARK],
    ["dark", null, null, null],
    ["light", null, DARK, null],
    ["dark", null, DARK, DARK],
  ] as const)(
    "%s theme with standard %s and dark %s",
    (appearance, logoSrc, darkLogoSrc, expected) => {
      expect(
        clinicLogoSrcForAppearance(appearance, { logoSrc, darkLogoSrc })
      ).toBe(expected);
    }
  );
});

describe("PracticeMark", () => {
  it("renders only the standard logo when dark theme has no dedicated file", () => {
    const html = renderToStaticMarkup(
      <PracticeMark
        chrome={{
          logoSrc: STANDARD,
          darkLogoSrc: null,
          displayName: "Riverside",
        }}
      />
    );
    expect(html).toContain(`src="${STANDARD}"`);
    expect(html).toContain("logoLight");
    expect(html).not.toContain("logoDark");
    expect(html.match(/<img\b/g)).toHaveLength(1);
  });

  it("renders both logos when a distinct dark logo exists", () => {
    const html = renderToStaticMarkup(
      <PracticeMark
        chrome={{
          logoSrc: STANDARD,
          darkLogoSrc: DARK,
          displayName: "Riverside",
        }}
      />
    );
    expect(html).toContain(`src="${STANDARD}"`);
    expect(html).toContain(`src="${DARK}"`);
    expect(html).toContain("logoLight");
    expect(html).toContain("logoDark");
  });

  it("renders nothing when the clinic has no logo", () => {
    const html = renderToStaticMarkup(
      <PracticeMark
        chrome={{
          logoSrc: null,
          darkLogoSrc: null,
          displayName: "Riverside",
        }}
      />
    );
    expect(html).toBe("");
  });
});

describe("patient logo css", () => {
  it("hides the standard logo in dark theme only when a dark logo is rendered", () => {
    const css = readFileSync("app/(aftercare)/patient.module.css", "utf8");
    const hides = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(
      (match) =>
        match[1].includes(".logoLight") && /display:\s*none/.test(match[2])
    );
    expect(hides.length).toBeGreaterThanOrEqual(3);
    for (const match of hides) {
      expect(match[1]).toContain(":has(.logoDark)");
    }
  });
});
