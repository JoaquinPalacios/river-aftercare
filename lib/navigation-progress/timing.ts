export const NAVIGATION_PROGRESS_SHOW_DELAY_MS = 120;
export const NAVIGATION_PROGRESS_COMPLETE_MS = 70;
export const NAVIGATION_PROGRESS_FADE_MS = 70;
export const NAVIGATION_PROGRESS_STUCK_MS = 15_000;

export const NAVIGATION_PROGRESS_STEPS = [
  { at: 0, value: 0.1 },
  { at: 180, value: 0.35 },
  { at: 480, value: 0.62 },
  { at: 860, value: 0.82 },
] as const;

export const NAVIGATION_PROGRESS_REDUCED_VALUE = 0.4;
