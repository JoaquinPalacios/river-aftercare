/** Always show the public header in this band at the top of the page. */
export const MARKETING_NAV_TOP_REVEAL_PX = 72;

/**
 * Ignore smaller movements so trackpads and inertial scroll do not flicker
 * the header. Movement accumulates until it crosses this distance.
 */
export const MARKETING_NAV_SCROLL_THRESHOLD_PX = 16;

export function nextMarketingNavVisibility(input: {
  hidden: boolean;
  scrollY: number;
  anchorY: number;
  menuOpen: boolean;
}): { hidden: boolean; anchorY: number } {
  const scrollY = Math.max(0, input.scrollY);
  if (input.menuOpen || scrollY <= MARKETING_NAV_TOP_REVEAL_PX) {
    return { hidden: false, anchorY: scrollY };
  }

  const delta = scrollY - input.anchorY;
  if (delta > MARKETING_NAV_SCROLL_THRESHOLD_PX) {
    return { hidden: true, anchorY: scrollY };
  }
  if (delta < -MARKETING_NAV_SCROLL_THRESHOLD_PX) {
    return { hidden: false, anchorY: scrollY };
  }
  return { hidden: input.hidden, anchorY: input.anchorY };
}
