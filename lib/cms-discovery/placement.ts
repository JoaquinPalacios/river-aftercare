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
