import "server-only";

import { z } from "zod";

import { SERVICE_CATEGORIES } from "@/lib/aftercare/service-category";
import { careGuideSlugSchema } from "@/lib/aftercare/slug";
import { CANONICAL_TEMPLATE_CLASSIFICATIONS } from "@/lib/canonical-templates/classification";
import { isReservedDemoCanonicalSlug } from "@/lib/canonical-templates/constants";
import { CanonicalTemplateError } from "@/lib/canonical-templates/errors";

export const canonicalTemplateTitleSchema = z
  .string()
  .trim()
  .min(1, "Enter a template title.")
  .max(120);

export const canonicalTemplateSlugSchema = careGuideSlugSchema.superRefine(
  (slug, context) => {
    if (isReservedDemoCanonicalSlug(slug)) {
      context.addIssue({
        code: "custom",
        message:
          "The slug extraction is reserved for the demo sample template.",
      });
    }
  }
);

export const canonicalServiceCategorySchema = z.enum(SERVICE_CATEGORIES, {
  error: "Choose a service category.",
});

export const canonicalTemplateClassificationSchema = z.enum(
  CANONICAL_TEMPLATE_CLASSIFICATIONS,
  { error: "Choose Production or Sample." }
);

const actorIdSchema = z.string().trim().min(1);

export const createCanonicalTemplateSchema = z.object({
  actorUserId: actorIdSchema,
  title: canonicalTemplateTitleSchema,
  slug: canonicalTemplateSlugSchema,
  serviceCategory: canonicalServiceCategorySchema,
  classification: canonicalTemplateClassificationSchema.default("PRODUCTION"),
});

export const duplicateCanonicalTemplateSchema = z.object({
  actorUserId: actorIdSchema,
  sourceTemplateId: z.string().trim().min(1),
  title: canonicalTemplateTitleSchema,
  slug: canonicalTemplateSlugSchema,
  serviceCategory: canonicalServiceCategorySchema,
  classification: canonicalTemplateClassificationSchema,
});

export const updateCanonicalTemplateMetadataSchema = z
  .object({
    actorUserId: actorIdSchema,
    templateId: z.string().trim().min(1),
    title: canonicalTemplateTitleSchema.optional(),
    slug: canonicalTemplateSlugSchema.optional(),
    serviceCategory: canonicalServiceCategorySchema.optional(),
    classification: canonicalTemplateClassificationSchema.optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.slug !== undefined ||
      value.serviceCategory !== undefined ||
      value.classification !== undefined,
    { message: "Choose a template detail to update." }
  );

export function parseCanonicalInput<T>(
  schema: z.ZodType<T>,
  value: unknown
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new CanonicalTemplateError(
      parsed.error.issues[0]?.message ??
        "That canonical template input is invalid.",
      "invalid"
    );
  }
  return parsed.data;
}
