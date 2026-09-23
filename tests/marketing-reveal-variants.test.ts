import { describe, expect, it } from "vitest";

import {
  CARD_REVEAL_DURATION,
  CARD_REVEAL_STAGGER,
  CARD_REVEAL_STAGGER_MAX,
  cardRevealDelay,
  cardRevealItemVariants,
  delayedRevealItemVariants,
  EDITORIAL_REVEAL_DURATION,
  EDITORIAL_REVEAL_STEP,
  editorialRevealDelay,
  HERO_PREVIEW_VARIANTS,
  MARKETING_MOTION_TIMING,
  MARKETING_REVEAL_MARGIN,
  MARKETING_REVEAL_VIEWPORT,
  REVEAL_EASE,
  REVEAL_ITEM_DURATION,
  REVEAL_STAGGER,
  REVEAL_VIEWPORT,
  REVEAL_Y,
  REVEAL_Y_CARD,
  heroContainerVariants,
  revealContainerVariants,
  revealItemVariants,
} from "@/lib/marketing/reveal-variants";

describe("marketing reveal variants", () => {
  it("slows editorial and card reveals slightly without going theatrical", () => {
    expect(MARKETING_MOTION_TIMING).toEqual({
      editorialDuration: 1,
      editorialStagger: 0.152,
      cardDuration: 0.9,
      cardStagger: 0.13,
      cardStaggerCap: 0.4,
    });
    expect(REVEAL_STAGGER).toBe(MARKETING_MOTION_TIMING.editorialStagger);
    expect(EDITORIAL_REVEAL_STEP).toBe(
      MARKETING_MOTION_TIMING.editorialStagger
    );
    expect(editorialRevealDelay(1)).toBe(0.152);
    expect(editorialRevealDelay(1)).toBe(EDITORIAL_REVEAL_STEP);
    expect(editorialRevealDelay(2)).toBe(0.304);
    expect(revealContainerVariants.visible).toEqual({});
    expect(EDITORIAL_REVEAL_DURATION).toBe(
      MARKETING_MOTION_TIMING.editorialDuration
    );
    expect(EDITORIAL_REVEAL_DURATION).toBeLessThanOrEqual(1);
    expect(CARD_REVEAL_DURATION).toBe(MARKETING_MOTION_TIMING.cardDuration);
    expect(REVEAL_ITEM_DURATION).toBe(EDITORIAL_REVEAL_DURATION);
    expect(REVEAL_EASE).toEqual([0.22, 1, 0.36, 1]);
    const delayed = delayedRevealItemVariants.visible(0.15);
    expect(delayed.transition.delay).toBe(0.15);
    expect(delayed.transition.duration).toBe(EDITORIAL_REVEAL_DURATION);
    expect(delayed.transition.ease).toEqual(REVEAL_EASE);
  });

  it("moves items a small distance rather than a theatrical drop", () => {
    const hidden = revealItemVariants.hidden;
    const visible = revealItemVariants.visible;

    expect(hidden.opacity).toBe(0);
    expect(hidden.transform).toBe(`translateY(${REVEAL_Y}px)`);
    expect(REVEAL_Y).toBeLessThanOrEqual(18);
    expect(visible.opacity).toBe(1);
    expect(visible.transform).toBe("translateY(0px)");
    expect(visible.transition.duration).toBe(EDITORIAL_REVEAL_DURATION);
    expect(visible.transition.type).toBe("tween");
  });

  it("gives the hero preview a restrained scale-in without bounce", () => {
    const hidden = HERO_PREVIEW_VARIANTS.hidden;
    const visible = HERO_PREVIEW_VARIANTS.visible;

    expect(hidden.transform).toContain("translateY(20px)");
    expect(hidden.transform).toContain("scale(0.985)");
    expect(visible.transform).toBe("translateY(0px) scale(1)");
    expect(visible.transition.ease).toEqual(REVEAL_EASE);
    expect(visible.transition.type).toBe("tween");
  });

  it("triggers once; SSR fallback uses the desktop bottom inset", () => {
    expect(MARKETING_REVEAL_VIEWPORT).toBe(REVEAL_VIEWPORT);
    expect(MARKETING_REVEAL_VIEWPORT.once).toBe(true);
    expect(MARKETING_REVEAL_VIEWPORT.margin).toBe("9999px 0px -200px 0px");
    expect(MARKETING_REVEAL_MARGIN).toBe("9999px 0px -200px 0px");
    expect("amount" in MARKETING_REVEAL_VIEWPORT).toBe(false);
  });

  it("staggers independent cards without a long cascade", () => {
    expect(CARD_REVEAL_STAGGER).toBe(MARKETING_MOTION_TIMING.cardStagger);
    expect(CARD_REVEAL_STAGGER_MAX).toBe(
      MARKETING_MOTION_TIMING.cardStaggerCap
    );
    expect(cardRevealDelay(0)).toBe(0);
    expect(cardRevealDelay(1)).toBe(CARD_REVEAL_STAGGER);
    expect(cardRevealDelay(3)).toBeLessThanOrEqual(CARD_REVEAL_STAGGER_MAX);
    expect(cardRevealDelay(8)).toBe(CARD_REVEAL_STAGGER_MAX);
    expect(cardRevealItemVariants.hidden.transform).toBe(
      `translateY(${REVEAL_Y_CARD}px)`
    );
    expect(REVEAL_Y_CARD).toBe(16);
    expect(cardRevealItemVariants.visible(0).transition.duration).toBe(
      CARD_REVEAL_DURATION
    );
  });

  it("keeps the hero stagger while later sections orchestrate with explicit delays", () => {
    expect(typeof heroContainerVariants.visible.transition.delayChildren).toBe(
      "function"
    );
    expect(revealContainerVariants.visible).toEqual({});
  });
});
