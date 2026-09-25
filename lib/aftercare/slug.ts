import "server-only";

import { z } from "zod";

import {
  CARE_GUIDE_SLUG_MAX_LENGTH,
  CARE_GUIDE_SLUG_MIN_LENGTH,
  CARE_GUIDE_SLUG_PATTERN,
  isValidCareGuideSlug,
} from "@/lib/aftercare/slug-rules";

export {
  CARE_GUIDE_SLUG_MAX_LENGTH,
  CARE_GUIDE_SLUG_MIN_LENGTH,
  CARE_GUIDE_SLUG_PATTERN,
  isValidCareGuideSlug,
};

export const careGuideSlugSchema = z
  .string()
  .min(CARE_GUIDE_SLUG_MIN_LENGTH)
  .max(CARE_GUIDE_SLUG_MAX_LENGTH)
  .regex(CARE_GUIDE_SLUG_PATTERN);
