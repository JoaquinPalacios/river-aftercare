import "server-only";

import { careGuideSlugSchema } from "@/lib/aftercare/slug";
import { GUIDE_SECTION_KINDS } from "@/lib/aftercare/types";
import { z } from "zod";

const optionalDay = z
  .union([z.number().int(), z.nan(), z.null(), z.undefined()])
  .transform((value) =>
    typeof value === "number" && Number.isInteger(value) ? value : null
  );

export const guideSectionDraftSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, "Each section needs a key.")
    .max(64)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use a lowercase url-safe section key."
    ),
  kind: z.enum(GUIDE_SECTION_KINDS),
  title: z.string().trim().min(1, "Enter a section title.").max(120),
  body: z.string().trim().min(1, "Enter section instructions.").max(8000),
  periodLabel: z
    .string()
    .trim()
    .max(80)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
  startDay: optionalDay,
  endDay: optionalDay,
});

export const saveGuideDraftSchema = z.object({
  guideId: z.string().trim().min(1),
  title: z.string().trim().min(1, "Enter a guide title.").max(120),
  publicSlug: careGuideSlugSchema,
  introduction: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((value) => (value ? value : null)),
  sections: z.array(guideSectionDraftSchema).max(40),
});

export const createCustomGuideSchema = z.object({
  title: z.string().trim().min(1, "Enter a guide title.").max(120),
  publicSlug: careGuideSlugSchema,
});

export const createTemplateGuideSchema = z.object({
  templateId: z.string().trim().min(1, "Choose a template."),
  publicSlug: careGuideSlugSchema.optional(),
});

export type SaveGuideDraftInput = z.infer<typeof saveGuideDraftSchema>;
export type CreateCustomGuideInput = z.infer<typeof createCustomGuideSchema>;
export type CreateTemplateGuideInput = z.infer<
  typeof createTemplateGuideSchema
>;
