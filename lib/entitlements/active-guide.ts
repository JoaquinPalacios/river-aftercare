import type { Prisma } from "@prisma/client";

/**
 * Downgrade-retained guides stay stored and are omitted from active capacity.
 * Expired rows keep downgradeRetainedAt set, so they stay out of capacity too.
 */
export const ACTIVE_PRACTICE_GUIDE_WHERE = {
  downgradeRetainedAt: null,
} as const satisfies Prisma.PracticeGuideWhereInput;
