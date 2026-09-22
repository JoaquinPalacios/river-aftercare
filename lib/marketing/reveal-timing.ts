/** Distance in pixels for ordinary editorial / card / preview reveals. */
export const REVEAL_Y = 14;
export const REVEAL_Y_CARD = 16;
export const REVEAL_Y_PREVIEW = 10;

/**
 * Adjust these values to tune marketing reveal speed.
 * Units are seconds (Motion). Viewport trigger thresholds live in
 * `lib/marketing/reveal-margin.ts` and should stay unchanged.
 */
export const MARKETING_MOTION_TIMING = {
  editorialDuration: 1.0,
  editorialStagger: 0.152,
  cardDuration: 0.9,
  cardStagger: 0.13,
  cardStaggerCap: 0.4,
} as const;

/** Hero container child stagger. */
export const REVEAL_STAGGER = MARKETING_MOTION_TIMING.editorialStagger;

/** Editorial group items (eyebrow → heading → copy → CTA). */
export const EDITORIAL_REVEAL_DURATION =
  MARKETING_MOTION_TIMING.editorialDuration;
export const EDITORIAL_REVEAL_STEP = MARKETING_MOTION_TIMING.editorialStagger;

/** Independent cards / process nodes. Cap keeps a desktop row from cascading. */
export const CARD_REVEAL_DURATION = MARKETING_MOTION_TIMING.cardDuration;
export const CARD_REVEAL_STAGGER = MARKETING_MOTION_TIMING.cardStagger;
export const CARD_REVEAL_STAGGER_MAX = MARKETING_MOTION_TIMING.cardStaggerCap;

/** Premium ease-out. Motion cubic-bezier(.22, 1, .36, 1). */
export const REVEAL_EASE = [0.22, 1, 0.36, 1] as const;

export function cardRevealDelay(index: number): number {
  return Math.min(index * CARD_REVEAL_STAGGER, CARD_REVEAL_STAGGER_MAX);
}

export function editorialRevealDelay(step: number): number {
  return step * EDITORIAL_REVEAL_STEP;
}
