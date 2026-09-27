import "server-only";

import {
  HOME_CARE_DURATION_UNITS,
  HOME_CARE_FREQUENCY_PERIODS,
} from "@/lib/aftercare/home-care-instruction";
import { SERVICE_CATEGORIES } from "@/lib/aftercare/service-category";
import { careGuideSlugSchema } from "@/lib/aftercare/slug";
import { GUIDE_SECTION_KINDS } from "@/lib/aftercare/types";
import { z } from "zod";

const optionalDay = z
  .union([z.number().int(), z.nan(), z.null(), z.undefined()])
  .transform((value) =>
    typeof value === "number" && Number.isInteger(value) ? value : null
  );

const optionalPositive = z
  .union([z.number(), z.nan(), z.null(), z.undefined()])
  .transform((value) =>
    typeof value === "number" && Number.isInteger(value) ? value : null
  );

const optionalLabel = z
  .string()
  .trim()
  .max(80)
  .nullable()
  .optional()
  .transform((value) => (value ? value : null));

export const homeCareInstructionDraftSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1, "Each instruction needs a key.")
      .max(64)
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Use a lowercase url-safe instruction key."
      ),
    title: z.string().trim().min(1, "Enter an instruction.").max(160),
    body: z
      .string()
      .trim()
      .max(4000)
      .nullable()
      .optional()
      .transform((value) => (value ? value : null)),
    frequencyCount: optionalPositive,
    frequencyPeriod: z
      .enum(HOME_CARE_FREQUENCY_PERIODS)
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    timingLabel: optionalLabel,
    durationValue: optionalPositive,
    durationUnit: z
      .enum(HOME_CARE_DURATION_UNITS)
      .nullable()
      .optional()
      .transform((value) => value ?? null),
  })
  .superRefine((item, context) => {
    const count = item.frequencyCount;
    const period = item.frequencyPeriod;
    if (count === null && period) {
      context.addIssue({
        code: "custom",
        path: ["frequencyCount"],
        message: "Enter how many times, or leave frequency blank.",
      });
    } else if (count !== null && !period) {
      context.addIssue({
        code: "custom",
        path: ["frequencyPeriod"],
        message: "Choose per day or per week.",
      });
    } else if (count !== null && count < 1) {
      context.addIssue({
        code: "custom",
        path: ["frequencyCount"],
        message: "Frequency must be at least 1.",
      });
    } else if (count !== null && count > 99) {
      context.addIssue({
        code: "custom",
        path: ["frequencyCount"],
        message: "Frequency must be 99 or less.",
      });
    }

    const duration = item.durationValue;
    const unit = item.durationUnit;
    if (duration === null && unit) {
      context.addIssue({
        code: "custom",
        path: ["durationValue"],
        message: "Enter a duration, or leave it blank.",
      });
    } else if (duration !== null && !unit) {
      context.addIssue({
        code: "custom",
        path: ["durationUnit"],
        message: "Choose days or weeks.",
      });
    } else if (duration !== null && duration < 1) {
      context.addIssue({
        code: "custom",
        path: ["durationValue"],
        message: "Duration must be at least 1.",
      });
    } else if (duration !== null && duration > 520) {
      context.addIssue({
        code: "custom",
        path: ["durationValue"],
        message: "Duration must be 520 or less.",
      });
    }
  });

export const guideSectionDraftSchema = z
  .object({
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
    body: z.string().trim().max(8000),
    periodLabel: z
      .string()
      .trim()
      .max(80)
      .nullable()
      .optional()
      .transform((value) => (value ? value : null)),
    startDay: optionalDay,
    endDay: optionalDay,
    homeCareInstructions: z
      .array(homeCareInstructionDraftSchema)
      .max(30)
      .optional()
      .transform((value) => value ?? []),
  })
  .superRefine((section, context) => {
    if (section.kind === "HOME_CARE_PLAN") {
      if (section.homeCareInstructions.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["homeCareInstructions"],
          message: "Add at least one home-care instruction.",
        });
      }
      const keys = section.homeCareInstructions.map((item) => item.key);
      if (new Set(keys).size !== keys.length) {
        context.addIssue({
          code: "custom",
          path: ["homeCareInstructions"],
          message: "Instruction keys must be unique.",
        });
      }
      return;
    }
    if (!section.body.trim()) {
      context.addIssue({
        code: "custom",
        path: ["body"],
        message: "Enter section instructions.",
      });
    }
  })
  .transform((section) =>
    section.kind === "HOME_CARE_PLAN"
      ? section
      : { ...section, homeCareInstructions: [] }
  );

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
  serviceCategory: z.enum(SERVICE_CATEGORIES).optional(),
});

export const createCustomGuideSchema = z.object({
  title: z.string().trim().min(1, "Enter a guide title.").max(120),
  publicSlug: careGuideSlugSchema,
  serviceCategory: z.enum(SERVICE_CATEGORIES, {
    error: "Choose a service category.",
  }),
});

export const createTemplateGuideSchema = z.object({
  templateId: z.string().trim().min(1, "Choose a template."),
  publicSlug: careGuideSlugSchema.optional(),
});

type ParsedSaveGuideDraft = z.infer<typeof saveGuideDraftSchema>;
type ParsedGuideSection = ParsedSaveGuideDraft["sections"][number];

export type SaveGuideDraftInput = Omit<ParsedSaveGuideDraft, "sections"> & {
  sections: Array<
    Omit<ParsedGuideSection, "homeCareInstructions"> & {
      homeCareInstructions?: ParsedGuideSection["homeCareInstructions"];
    }
  >;
};
export type CreateCustomGuideInput = z.infer<typeof createCustomGuideSchema>;
export type CreateTemplateGuideInput = z.infer<
  typeof createTemplateGuideSchema
>;
