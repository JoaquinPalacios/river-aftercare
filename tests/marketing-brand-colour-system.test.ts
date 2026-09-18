import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CLINIC_VERTICAL_NAV } from "@/lib/marketing/clinic-verticals";
import {
  RIVER_SPECTRUM_PRIMITIVES,
  VERTICAL_ACCENT_FAMILY,
  type VerticalThemeId,
} from "@/lib/marketing/vertical-landing";

const TEXT_CONTRAST_RATIO = 4.5;
const UI_CONTRAST_RATIO = 3;

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function linearizeSrgbChannel(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const [red, green, blue] = hexToRgb(hex);
  return (
    0.2126 * linearizeSrgbChannel(red) +
    0.7152 * linearizeSrgbChannel(green) +
    0.0722 * linearizeSrgbChannel(blue)
  );
}

function contrastRatio(first: string, second: string): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

describe("marketing brand colour hierarchy", () => {
  const tokens = readFileSync("app/(marketing)/marketing.css", "utf8");
  const styles = readFileSync("app/(marketing)/marketing.module.css", "utf8");
  const logo = readFileSync("public/brand/river-aftercare-logo.svg", "utf8");
  const mark = readFileSync("public/brand/river-aftercare-isologo.svg", "utf8");

  it("formalises Current isologo colours as River spectrum primitives", () => {
    expect(RIVER_SPECTRUM_PRIMITIVES).toEqual({
      deep: "#2D3BB8",
      blue: "#3B4BD1",
      periwinkle: "#7C8CFF",
      cyan: "#67C5D6",
    });
    expect(tokens).toContain("--river-deep: #2d3bb8");
    expect(tokens).toContain("--river-blue: #3b4bd1");
    expect(tokens).toContain("--river-periwinkle: #7c8cff");
    expect(tokens).toContain("--river-cyan: #67c5d6");
    expect(tokens).toContain(
      "--mk-brand: light-dark(var(--river-blue), #a6b8ff)"
    );
    expect(tokens).toContain(
      "--mk-brand-strong: light-dark(var(--river-blue), var(--river-periwinkle))"
    );
    expect(tokens).toContain(
      "--mk-sky: light-dark(var(--river-cyan), #7ec8e6)"
    );
    expect(tokens).toContain("--mk-sky-strong: light-dark(#146f88, #5ec8e0)");
    expect(tokens).toContain("--mk-sky-text: light-dark(#146f88, #7ec8e6)");
    expect(tokens).toContain("--mk-sky-glow:");
    expect(tokens).toContain("--mk-sky-soft:");
    expect(tokens).toContain("--mk-sky-border:");
    expect(tokens).toContain("--mk-sky-hover:");
    expect(tokens).toContain(
      "--mk-cobalt: light-dark(var(--river-blue), #3d58d6)"
    );
    expect(tokens).toContain(
      "--mk-cobalt-deep: light-dark(var(--river-deep), #2c46c4)"
    );
    expect(tokens).toContain(
      "--mk-cobalt-soft: light-dark(var(--river-blue), #8ea0ff)"
    );
    expect(tokens).toContain(
      "--mk-periwinkle-text: light-dark(#515fd8, #a6b8ff)"
    );
    expect(tokens).toContain("--mk-teal: light-dark(#50b2b9, #62b8b4)");
    expect(tokens).toContain("--mk-teal-strong: light-dark(#0e6e72, #5aaeae)");
    expect(tokens).toContain("--mk-teal-text: light-dark(#12757c, #62b8b4)");
    expect(tokens).toContain("--mk-teal-glow:");
    expect(tokens).toContain("--mk-wave-cyan: var(--mk-sky)");
    expect(tokens).toContain("--mk-rail-end: var(--mk-sky)");
    expect(tokens).toContain("--mk-hero-mist: var(--mk-sky-glow)");
    expect(tokens).not.toContain("--mk-lavender");
  });

  it("keeps primary conversion on River Blue and connectors on cyan", () => {
    expect(styles).toMatch(
      /\.primary\s*\{[^}]*background:\s*var\(--mk-brand-strong\)/
    );
    expect(styles).not.toMatch(/\.primary\s*\{[^}]*--mk-sky/);
    expect(styles).not.toMatch(/\.primary\s*\{[^}]*--mk-teal/);
    expect(styles).toContain("var(--mk-rail-end)");
    expect(styles).toContain("var(--mk-sky)");
    expect(styles).toContain(".eyebrowFlow");
    expect(styles).toContain(".flowSection .eyebrow");
    expect(styles).toContain("inset 0.18rem 0 0 var(--mk-sky)");
  });

  it("maps each vertical to a distinct accent family without route checks", () => {
    expect(VERTICAL_ACCENT_FAMILY).toEqual({
      dental: "cobalt",
      physiotherapy: "teal",
      chiropractic: "periwinkle",
      cosmetic: "cyan",
    } satisfies Record<VerticalThemeId, string>);

    expect(new Set(Object.values(VERTICAL_ACCENT_FAMILY)).size).toBe(4);

    expect(CLINIC_VERTICAL_NAV.map((item) => item.themeId)).toEqual([
      "dental",
      "physiotherapy",
      "chiropractic",
      "cosmetic",
    ]);

    expect(styles).toContain('data-vertical="dental"');
    expect(styles).toContain('data-vertical="physiotherapy"');
    expect(styles).toContain('data-vertical="chiropractic"');
    expect(styles).toContain('data-vertical="cosmetic"');
    expect(styles).toContain("--vertical-accent: var(--mk-cobalt-soft)");
    expect(styles).toContain("--vertical-accent: var(--mk-teal)");
    expect(styles).toContain("--vertical-accent-text: var(--mk-teal-text)");
    expect(styles).toContain("--vertical-accent: var(--mk-wave-periwinkle)");
    expect(styles).toContain(
      "--vertical-accent-text: var(--mk-periwinkle-text)"
    );
    expect(styles).toContain("--vertical-accent: var(--mk-sky)");
    expect(styles).toContain("--vertical-accent-text: var(--mk-sky-text)");
    expect(styles).not.toContain("--mk-lavender");
    expect(styles).not.toContain(".dental-card");
    expect(styles).not.toContain(".physio-card");
    expect(styles).not.toContain(".chiro-card");
    expect(styles).not.toContain("if dental");
    expect(styles).not.toContain("/physiotherapy");
  });

  it("styles discovery cards through shared semantic vertical variants", () => {
    expect(styles).toContain(".clinicTypeCard[data-vertical] h3");
    expect(styles).toContain("color: var(--vertical-accent-text)");
    expect(styles).toContain("inset 0.2rem 0 0 var(--vertical-accent)");
    expect(styles).toContain("background: var(--vertical-card-tint)");
    expect(styles).toContain("border-color: var(--vertical-card-border)");
    expect(styles).toContain(".clinicsHubCardCta");
    expect(styles).not.toContain(
      '.clinicsHubCard[data-vertical="physiotherapy"] .clinicsHubCardRail'
    );
  });

  it("defines a vertical atmosphere layer with explicit light and dark values", () => {
    const atmosphereTokens = [
      "--vertical-hero-canvas",
      "--vertical-hero-bloom",
      "--vertical-hero-mist",
      "--vertical-surface-soft",
      "--vertical-surface-emphasis",
      "--vertical-card-tint",
      "--vertical-card-border",
      "--vertical-section-glow",
      "--vertical-closing-bloom",
    ] as const;

    for (const token of atmosphereTokens) {
      expect(tokens).toContain(`${token}:`);
      expect(styles).toContain(`${token}:`);
    }

    expect(styles).toContain('data-brand-scope="master"');
    expect(styles).toContain(".verticalSurfaceCanvas");
    expect(styles).toContain("background: var(--vertical-surface-soft)");
    expect(styles).toContain("background: var(--vertical-surface-emphasis)");
    expect(styles).toContain("background-color: var(--vertical-hero-canvas)");
    expect(styles).toContain("var(--vertical-hero-bloom)");
    expect(styles).toContain("var(--vertical-hero-mist)");
    expect(styles).toContain("var(--vertical-card-tint)");
    expect(styles).toContain("var(--vertical-closing-bloom)");
    expect(styles).toContain("light-dark(");
    expect(styles).toContain("--vertical-surface-soft: light-dark(");
    expect(styles).toContain("--vertical-hero-bloom: light-dark(");
    expect(styles).toContain("color-mix(in srgb, var(--mk-sky) 8%, #f4fbfd)");
    expect(styles).toContain(
      "color-mix(in srgb, var(--mk-cobalt-deep) 6%, #f3f5fb)"
    );
    expect(styles).toContain(
      "color-mix(in srgb, var(--mk-wave-periwinkle) 8%, #faf8ff)"
    );
    expect(styles).toContain("color-mix(in srgb, var(--mk-teal) 8%, #f3fbf9)");
    expect(styles).toContain("color-mix(in srgb, #7c8cff 12%, var(--mk-hero))");
    expect(styles).toContain("color-mix(in srgb, #2c46c4 18%, #05070c)");
    expect(styles).toContain("color-mix(in srgb, #5ec8e0 9%, var(--mk-hero))");
    expect(styles).toContain("color-mix(in srgb, #5aaeae 9%, var(--mk-hero))");
    expect(styles).not.toContain("color-mix(in srgb, #a6b8ff 11%, #0b0a12)");
  });

  it("keeps atmosphere in CSS tokens rather than component hex values", () => {
    const experience = readFileSync(
      "app/(marketing)/components/marketing-experience.tsx",
      "utf8"
    );
    const landing = readFileSync(
      "app/(marketing)/components/marketing-vertical-landing.tsx",
      "utf8"
    );
    const hero = readFileSync(
      "app/(marketing)/components/marketing-vertical-hero.tsx",
      "utf8"
    );
    const hub = readFileSync(
      "app/(marketing)/components/marketing-clinics-hub.tsx",
      "utf8"
    );

    for (const source of [experience, landing, hero, hub]) {
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}/);
      expect(source).not.toContain("color-mix(");
    }

    expect(experience).toContain(
      'data-brand-scope={verticalId ? "vertical" : "master"}'
    );
  });

  it("does not recolour official logo artwork", () => {
    expect(logo).toContain("#3B4BD1");
    expect(logo).toContain("#7C8CFF");
    expect(logo).toContain("#67C5D6");
    expect(logo).toContain("#2D3BB8");
    expect(logo).toContain("#F5F3EE");
    expect(mark).toContain("#3B4BD1");
    expect(mark).toContain("#67C5D6");
    expect(mark).toContain("#7C8CFF");
    expect(mark).toContain("#2D3BB8");
  });

  it("does not leak marketing vertical tokens into clinic tenant theming", () => {
    const theme = readFileSync("lib/branding/aftercare-theme.ts", "utf8");
    const aftercareCss = readFileSync("app/(aftercare)/aftercare.css", "utf8");
    const patientCss = readFileSync(
      "app/(aftercare)/patient.module.css",
      "utf8"
    );
    const tenantLayout = readFileSync(
      "app/(aftercare)/%5Fsites/[tenant]/layout.tsx",
      "utf8"
    );

    for (const source of [theme, aftercareCss, patientCss, tenantLayout]) {
      expect(source).not.toContain("--river-");
      expect(source).not.toContain("--mk-teal");
      expect(source).not.toContain("--vertical-accent");
      expect(source).not.toContain("VERTICAL_ACCENT_FAMILY");
      expect(source).not.toContain("data-vertical");
    }

    expect(theme).toContain("--cg-brand");
    expect(theme).toContain("primaryColor");
    expect(theme).toContain("accentColor");
    expect(theme).toContain("neutralColor");
    expect(tenantLayout).toContain("resolveAftercareTheme");
  });

  it("meets AA text contrast for river, teal, cyan, and muted pairs", () => {
    const darkPairs = [
      ["#a6b8ff", "#07090e"],
      ["#a6b8ff", "#171b24"],
      ["#7ec8e6", "#07090e"],
      ["#7ec8e6", "#171b24"],
      ["#7ec8e6", "#1c2433"],
      ["#8ea0ff", "#07090e"],
      ["#8ea0ff", "#171b24"],
      ["#62b8b4", "#07090e"],
      ["#62b8b4", "#171b24"],
      ["#98a2b3", "#07090e"],
      ["#f5f3ee", "#07090e"],
      ["#0a0d14", "#7c8cff"],
    ] as const;
    const lightPairs = [
      ["#3b4bd1", "#fffcf8"],
      ["#146f88", "#fffcf8"],
      ["#146f88", "#ffffff"],
      ["#146f88", "#f8f6f1"],
      ["#12757c", "#fffcf8"],
      ["#12757c", "#ffffff"],
      ["#12757c", "#f3fbf9"],
      ["#0e6e72", "#fffcf8"],
      ["#515fd8", "#fffcf8"],
      ["#515fd8", "#faf8ff"],
      ["#5c6573", "#fffcf8"],
      ["#ffffff", "#3b4bd1"],
    ] as const;

    for (const [foreground, background] of [...darkPairs, ...lightPairs]) {
      expect(
        contrastRatio(foreground, background),
        `${foreground} on ${background}`
      ).toBeGreaterThanOrEqual(TEXT_CONTRAST_RATIO);
    }

    expect(contrastRatio("#7c8cff", "#07090e")).toBeGreaterThanOrEqual(
      UI_CONTRAST_RATIO
    );
    expect(contrastRatio("#5ec8e0", "#07090e")).toBeGreaterThanOrEqual(
      UI_CONTRAST_RATIO
    );
    expect(contrastRatio("#50b2b9", "#07090e")).toBeGreaterThanOrEqual(
      UI_CONTRAST_RATIO
    );
    expect(contrastRatio("#62b8b4", "#07090e")).toBeGreaterThanOrEqual(
      UI_CONTRAST_RATIO
    );
    expect(contrastRatio("#67c5d6", "#fffcf8")).toBeLessThan(
      TEXT_CONTRAST_RATIO
    );
    expect(contrastRatio("#7c8cff", "#fffcf8")).toBeLessThan(
      TEXT_CONTRAST_RATIO
    );
    expect(contrastRatio("#50b2b9", "#fffcf8")).toBeLessThan(
      TEXT_CONTRAST_RATIO
    );

    const tintedLightPairs = [
      ["#0a0d14", "#f1f0f5"],
      ["#0a0d14", "#e9f7fa"],
      ["#0a0d14", "#e7eaf7"],
      ["#0a0d14", "#f0efff"],
      ["#0a0d14", "#f3fbf9"],
      ["#5c6573", "#f1f0f5"],
      ["#5c6573", "#e9f7fa"],
      ["#146f88", "#e9f7fa"],
      ["#146f88", "#f4fbfd"],
      ["#12757c", "#f3fbf9"],
      ["#12757c", "#eef7f6"],
      ["#3b4bd1", "#f1f0f5"],
      ["#3b4bd1", "#f3f5fb"],
      ["#515fd8", "#faf8ff"],
      ["#515fd8", "#f3f0f8"],
    ] as const;
    const tintedDarkPairs = [
      ["#f5f3ee", "#101321"],
      ["#a6b8ff", "#101321"],
      ["#7ec8e6", "#101321"],
      ["#8ea0ff", "#101321"],
      ["#62b8b4", "#101321"],
      ["#98a2b3", "#101321"],
      ["#f5f3ee", "#171b24"],
      ["#7ec8e6", "#1a2428"],
      ["#62b8b4", "#1a2428"],
      ["#f5f3ee", "#15182a"],
      ["#a6b8ff", "#15182a"],
      ["#8ea0ff", "#15182a"],
      ["#98a2b3", "#15182a"],
      ["#f5f3ee", "#0b1129"],
      ["#8ea0ff", "#0b1129"],
      ["#98a2b3", "#0b1129"],
      ["#f5f3ee", "#1a1b2a"],
      ["#a6b8ff", "#1a1b2a"],
      ["#98a2b3", "#1a1b2a"],
    ] as const;

    for (const [foreground, background] of [
      ...tintedLightPairs,
      ...tintedDarkPairs,
    ]) {
      expect(
        contrastRatio(foreground, background),
        `${foreground} on ${background}`
      ).toBeGreaterThanOrEqual(TEXT_CONTRAST_RATIO);
    }
  });
});
