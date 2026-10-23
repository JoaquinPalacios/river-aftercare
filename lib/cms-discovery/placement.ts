export type DiscoveryRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type TourCardPlacement = {
  spot: DiscoveryRect | null;
  top: number;
  left: number;
  width: number;
};

const CARD_WIDTH = 352;
const GAP = 12;
const MARGIN = 16;
const SPOT_PAD = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Shrink a layout viewport to the part of the window that is actually on
 * the screen. `screenX` and `outerWidth` are physical pixels; `width` is the
 * layout viewport in CSS pixels. A window that sits fully on the screen keeps
 * its layout size.
 */
export function visibleLayoutSize(input: {
  width: number;
  height: number;
  screenX?: number;
  screenY?: number;
  outerWidth?: number;
  outerHeight?: number;
  availWidth?: number;
  availHeight?: number;
}): { width: number; height: number } {
  return {
    width: visibleAxis(
      input.width,
      input.screenX,
      input.outerWidth,
      input.availWidth
    ),
    height: visibleAxis(
      input.height,
      input.screenY,
      input.outerHeight,
      input.availHeight
    ),
  };
}

function visibleAxis(
  layout: number,
  origin: number | undefined,
  outer: number | undefined,
  avail: number | undefined
): number {
  if (
    !Number.isFinite(layout) ||
    layout <= 0 ||
    origin === undefined ||
    !Number.isFinite(origin) ||
    !outer ||
    outer <= 0 ||
    !avail ||
    avail <= 0
  ) {
    return layout;
  }
  // The window sits fully on the reported screen. Keep the CSS layout size
  // when outer pixels and CSS pixels differ slightly.
  if (origin >= -1 && origin + outer <= avail + 1) {
    return layout;
  }
  // avail tracks the layout viewport while outer includes browser chrome
  // (device emulation). Those figures are not one screen.
  if (avail <= layout + 80 && outer > avail + 48) {
    return layout;
  }
  const visible = Math.min(avail, origin + outer) - Math.max(origin, 0);
  if (visible <= 0) {
    return layout;
  }
  return Math.min(layout, (layout * visible) / outer);
}

export function placeTourCard(input: {
  viewportWidth: number;
  viewportHeight: number;
  target: DiscoveryRect | null;
  cardHeight: number;
}): TourCardPlacement {
  const width = Math.min(
    CARD_WIDTH,
    Math.max(0, input.viewportWidth - MARGIN * 2)
  );
  const cardHeight = Math.max(0, input.cardHeight);

  if (
    !input.target ||
    input.target.width <= 0 ||
    input.target.height <= 0 ||
    width <= 0
  ) {
    return {
      spot: null,
      top: clamp(
        (input.viewportHeight - cardHeight) / 2,
        MARGIN,
        Math.max(MARGIN, input.viewportHeight - cardHeight - MARGIN)
      ),
      left: Math.max(MARGIN, (input.viewportWidth - width) / 2),
      width,
    };
  }

  const spot: DiscoveryRect = {
    top: input.target.top - SPOT_PAD,
    left: input.target.left - SPOT_PAD,
    width: input.target.width + SPOT_PAD * 2,
    height: input.target.height + SPOT_PAD * 2,
  };
  const narrow = input.viewportWidth < 768;

  if (narrow) {
    return {
      spot,
      top: clamp(
        input.viewportHeight - cardHeight - MARGIN,
        MARGIN,
        Math.max(MARGIN, input.viewportHeight - cardHeight - MARGIN)
      ),
      left: MARGIN,
      width,
    };
  }

  const candidates = [
    { top: spot.top, left: spot.left + spot.width + GAP },
    { top: spot.top + spot.height + GAP, left: spot.left },
    { top: spot.top - GAP - cardHeight, left: spot.left },
    { top: spot.top, left: spot.left - GAP - width },
  ];

  for (const candidate of candidates) {
    if (
      candidate.left >= MARGIN &&
      candidate.top >= MARGIN &&
      candidate.left + width <= input.viewportWidth - MARGIN &&
      candidate.top + cardHeight <= input.viewportHeight - MARGIN
    ) {
      return { spot, top: candidate.top, left: candidate.left, width };
    }
  }

  const left = clamp(
    spot.left,
    MARGIN,
    Math.max(MARGIN, input.viewportWidth - MARGIN - width)
  );
  let top = spot.top + spot.height + GAP;
  if (top + cardHeight > input.viewportHeight - MARGIN) {
    top = spot.top - GAP - cardHeight;
  }
  top = clamp(
    top,
    MARGIN,
    Math.max(MARGIN, input.viewportHeight - cardHeight - MARGIN)
  );

  return { spot, top, left, width };
}

/**
 * Move a card that was just positioned from `placement` back inside the
 * viewport. `card` is that card's viewport rect after the placement was
 * applied. Any gap between the rect and the placement is preserved, so a
 * positioned ancestor does not send the correction to the wrong origin.
 */
export function keepTourCardOnScreen(input: {
  placement: TourCardPlacement;
  card: DiscoveryRect;
  viewportWidth: number;
  viewportHeight: number;
}): TourCardPlacement {
  const width = Math.min(
    Math.max(input.placement.width, input.card.width),
    Math.max(0, input.viewportWidth - MARGIN * 2)
  );
  const height = Math.max(0, input.card.height);
  let visualLeft = input.card.left;
  let visualTop = input.card.top;
  const spot = input.placement.spot;
  const overflowsRight = visualLeft + width > input.viewportWidth - MARGIN;

  if (
    overflowsRight &&
    spot &&
    height > 0 &&
    spot.top + spot.height + GAP + height <= input.viewportHeight - MARGIN
  ) {
    visualTop = spot.top + spot.height + GAP;
    visualLeft = clamp(
      spot.left,
      MARGIN,
      Math.max(MARGIN, input.viewportWidth - MARGIN - width)
    );
  }

  if (visualLeft + width > input.viewportWidth - MARGIN) {
    visualLeft = input.viewportWidth - MARGIN - width;
  }
  if (visualLeft < MARGIN) {
    visualLeft = MARGIN;
  }
  if (height > 0 && visualTop + height > input.viewportHeight - MARGIN) {
    visualTop = input.viewportHeight - MARGIN - height;
  }
  if (visualTop < MARGIN) {
    visualTop = MARGIN;
  }

  return {
    spot,
    top: visualTop - (input.card.top - input.placement.top),
    left: visualLeft - (input.card.left - input.placement.left),
    width,
  };
}
