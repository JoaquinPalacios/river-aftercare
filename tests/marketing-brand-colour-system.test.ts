import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CLINIC_VERTICAL_NAV } from "@/lib/marketing/clinic-verticals";
import {
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

  it("formalises sky, cobalt, and lavender as semantic marketing tokens", () => {
    expect(tokens).toContain("--mk-sky: light-dark(#67c5d6, #7ec8e6)");
    expect(tokens).toContain("--mk-sky-strong: light-dark(#146f88, #5ec8e0)");
    expect(tokens).toContain("--mk-sky-text: light-dark(#146f88, #7ec8e6)");
    expect(tokens).toContain("--mk-sky-glow:");
    expect(tokens).toContain("--mk-sky-soft:");
    expect(tokens).toContain("--mk-sky-border:");
    expect(tokens).toContain("--mk-sky-hover:");
    expect(tokens).toContain("--mk-cobalt: light-dark(#3b4bd1, #3d58d6)");
    expect(tokens).toContain("--mk-cobalt-deep: light-dark(#2d3bb8, #2c46c4)");
    expect(tokens).toContain("--mk-cobalt-soft: light-dark(#3b4bd1, #8ea0ff)");
    expect(tokens).toContain("--mk-lavender:");
    expect(tokens).toContain("--mk-wave-cyan: var(--mk-sky)");
    expect(tokens).toContain("--mk-rail-end: var(--mk-sky)");
    expect(tokens).toContain("--mk-hero-mist: var(--mk-sky-glow)");
    expect(tokens).toContain("--mk-brand: light-dark(#3b4bd1, #a6b8ff)");
    expect(tokens).toContain("--mk-brand-strong: light-dark(#3b4bd1, #7c8cff)");
  });

  it("keeps primary conversion on periwinkle and connectors on sky", () => {
    expect(styles).toMatch(
      /\.primary\s*\{[^}]*background:\s*var\(--mk-brand-strong\)/
    );
    expect(styles).not.toMatch(/\.primary\s*\{[^}]*--mk-sky/);
    expect(styles).toContain("var(--mk-rail-end)");
    expect(styles).toContain("var(--mk-sky)");
    expect(styles).toContain(".eyebrowFlow");
    expect(styles).toContain(".flowSection .eyebrow");
    expect(styles).toContain("inset 0.18rem 0 0 var(--mk-sky)");
  });

  it("maps each vertical to an explicit accent family without route checks", () => {
    expect(VERTICAL_ACCENT_FAMILY).toEqual({
      dental: "periwinkle",
      physiotherapy: "sky",
      chiropractic: "cobalt",
      cosmetic: "lavender",
    } satisfies Record<VerticalThemeId, string>);

    expect(CLINIC_VERTICAL_NAV.map((item) => item.themeId)).toEqual([
      "dental",
      "physiotherapy",
      "chiropractic",
      "cosmetic",
    ]);

    expect(styles).toContain('data-vertical="dental"');
    expect(styles).toContain("--vertical-accent: var(--mk-sky)");
    expect(styles).toContain("--vertical-accent-text: var(--mk-sky-text)");
    expect(styles).toContain("--vertical-accent: var(--mk-cobalt-soft)");
    expect(styles).toContain("--vertical-accent: var(--mk-lavender)");
    expect(styles).not.toContain("if dental");
    expect(styles).not.toContain("/physiotherapy");
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
  });

  it("meets AA text contrast for periwinkle, sky, cobalt, and muted pairs", () => {
    const darkPairs = [
      ["#a6b8ff", "#07090e"],
      ["#a6b8ff", "#171b24"],
      ["#7ec8e6", "#07090e"],
      ["#7ec8e6", "#171b24"],
      ["#7ec8e6", "#1c2433"],
      ["#8ea0ff", "#07090e"],
      ["#8ea0ff", "#171b24"],
      ["#98a2b3", "#07090e"],
      ["#f5f3ee", "#07090e"],
      ["#0a0d14", "#7c8cff"],
    ] as const;
    const lightPairs = [
      ["#3b4bd1", "#fffcf8"],
      ["#146f88", "#fffcf8"],
      ["#146f88", "#ffffff"],
      ["#146f88", "#f8f6f1"],
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
    expect(contrastRatio("#67c5d6", "#fffcf8")).toBeLessThan(
      TEXT_CONTRAST_RATIO
    );
  });
});
