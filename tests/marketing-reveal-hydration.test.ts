import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { isMarketingMotionEnabled } from "@/lib/marketing/marketing-motion-enabled";
import {
  CARD_REVEAL_STAGGER,
  CARD_REVEAL_STAGGER_MAX,
  cardRevealDelay,
  editorialRevealDelay,
} from "@/lib/marketing/reveal-timing";

const revealSource = readFileSync(
  "app/(marketing)/components/marketing-reveal.tsx",
  "utf8"
);

describe("marketing reveal hydration contract", () => {
  it("does not arm Motion from an unknown reduced-motion value", () => {
    expect(isMarketingMotionEnabled(false, null)).toBe(false);
    expect(isMarketingMotionEnabled(false, false)).toBe(false);
    expect(isMarketingMotionEnabled(false, true)).toBe(false);
    expect(isMarketingMotionEnabled(true, null)).toBe(false);
    expect(isMarketingMotionEnabled(true, true)).toBe(false);
    expect(isMarketingMotionEnabled(true, false)).toBe(true);
  });

  it("keeps the shared reveal component on a hydration-stable motion gate", () => {
    expect(revealSource).toContain("isMarketingMotionEnabled");
    expect(revealSource).toContain("useClientReady");
    expect(revealSource).not.toMatch(/const motionOn = reduced === false/);
    expect(revealSource).not.toContain("suppressHydrationWarning");
    expect(revealSource).not.toContain("ssr: false");
  });

  it("always marks items and cards pending so CSS can hide before paint", () => {
    expect(revealSource).not.toMatch(
      /data-mk-pending=\{motionOn \? "" : undefined\}/
    );
    expect(revealSource).toContain('data-mk-pending=""');
    expect(revealSource).toContain("data-mk-card");
  });

  it("preserves existing stagger metadata", () => {
    expect(editorialRevealDelay(0)).toBe(0);
    expect(editorialRevealDelay(1)).toBe(0.15);
    expect(editorialRevealDelay(2)).toBe(0.3);
    expect(cardRevealDelay(0)).toBe(0);
    expect(cardRevealDelay(1)).toBe(CARD_REVEAL_STAGGER);
    expect(cardRevealDelay(8)).toBe(CARD_REVEAL_STAGGER_MAX);
  });
});
