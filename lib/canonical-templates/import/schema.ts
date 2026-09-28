import "server-only";

import { z } from "zod";

import type { ServiceCategory } from "@/lib/aftercare/service-category";
import { guideSectionDraftSchema } from "@/lib/clinic-portal/guide-schemas";
import {
  forbiddenImportFieldMessage,
  isCanonicalTemplateImportMode,
  CANONICAL_TEMPLATE_IMPORT_SCHEMA_VERSION,
  type CanonicalTemplateImportMode,
} from "@/lib/canonical-templates/import/constants";
import { unsupportedImportSchemaVersionMessage } from "@/lib/canonical-templates/import/messages";
import {
  canonicalServiceCategorySchema,
  canonicalTemplateSlugSchema,
  canonicalTemplateTitleSchema,
} from "@/lib/canonical-templates/schemas";
import {
  parseCanonicalDraftSections,
  type CanonicalDraftSection,
} from "@/lib/canonical-templates/sections";
import { isCanonicalTemplateError } from "@/lib/canonical-templates/errors";

const ROOT_KEYS = ["schemaVersion", "mode", "template", "revision"] as const;
const TEMPLATE_KEYS = ["title", "slug", "serviceCategory"] as const;
const REVISION_KEYS = ["sections"] as const;
const SECTION_KEYS = [
  "key",
  "kind",
  "title",
  "body",
  "periodLabel",
  "startDay",
  "endDay",
  "homeCareInstructions",
] as const;
const INSTRUCTION_KEYS = [
  "key",
  "title",
  "body",
  "frequencyCount",
  "frequencyPeriod",
  "timingLabel",
  "durationValue",
  "durationUnit",
] as const;

const identitySchema = z
  .object({
    schemaVersion: z.literal(CANONICAL_TEMPLATE_IMPORT_SCHEMA_VERSION),
    mode: z.enum(["create", "create-revision", "update-draft"]),
    template: z
      .object({
        title: canonicalTemplateTitleSchema.optional(),
        slug: canonicalTemplateSlugSchema,
        serviceCategory: canonicalServiceCategorySchema,
      })
      .strict(),
    revision: z
      .object({
        sections: z.array(z.unknown()),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.mode === "create" && value.template.title === undefined) {
      context.addIssue({
        code: "custom",
        path: ["template", "title"],
        message: "Enter a template title.",
      });
    }
  });

export interface ParsedCanonicalTemplateImport {
  mode: CanonicalTemplateImportMode;
  template: {
    title: string | null;
    slug: string;
    serviceCategory: ServiceCategory;
  };
  sections: CanonicalDraftSection[];
}

export interface CanonicalTemplateImportPartial {
  modeLabel: string | null;
  title: string | null;
  slug: string | null;
  serviceCategory: string | null;
  sectionCount: number | null;
  homeCareInstructionCount: number | null;
}

export interface CanonicalTemplateImportValidation {
  ok: boolean;
  errors: string[];
  parsed: ParsedCanonicalTemplateImport | null;
  partial: CanonicalTemplateImportPartial;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function emptyPartial(): CanonicalTemplateImportPartial {
  return {
    modeLabel: null,
    title: null,
    slug: null,
    serviceCategory: null,
    sectionCount: null,
    homeCareInstructionCount: null,
  };
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function checkAllowedKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  location: string,
  errors: string[]
) {
  for (const key of Object.keys(record)) {
    const forbidden = forbiddenImportFieldMessage(key);
    if (forbidden) {
      errors.push(forbidden);
      continue;
    }
    if (!allowed.includes(key)) {
      errors.push(
        `Unrecognized import field "${key}" on ${location}. Schema version 1 does not accept it.`
      );
    }
  }
}

function assertWholeNumber(
  value: unknown,
  label: string,
  errors: string[]
): void {
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    errors.push(`${label} must be a whole number.`);
  }
}

function assertOptionalString(
  value: unknown,
  label: string,
  errors: string[]
): void {
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value !== "string") {
    errors.push(`${label} must be a string.`);
  }
}

function collectShapeErrors(payload: Record<string, unknown>): string[] {
  const errors: string[] = [];
  checkAllowedKeys(payload, ROOT_KEYS, "the payload", errors);

  if (!isPlainObject(payload.template)) {
    errors.push(
      "template must be an object with title, slug, and serviceCategory."
    );
  } else {
    checkAllowedKeys(payload.template, TEMPLATE_KEYS, "template", errors);
    if (
      "title" in payload.template &&
      typeof payload.template.title !== "string"
    ) {
      errors.push("template.title must be a string.");
    }
    if (
      "slug" in payload.template &&
      typeof payload.template.slug !== "string"
    ) {
      errors.push("template.slug must be a string.");
    }
    if (
      "serviceCategory" in payload.template &&
      typeof payload.template.serviceCategory !== "string"
    ) {
      errors.push("template.serviceCategory must be a string.");
    }
  }

  if (!isPlainObject(payload.revision)) {
    errors.push("revision must be an object with sections.");
    return errors;
  }

  checkAllowedKeys(payload.revision, REVISION_KEYS, "revision", errors);
  const sections = payload.revision.sections;
  if (!Array.isArray(sections)) {
    errors.push("revision.sections must be an array.");
    return errors;
  }

  sections.forEach((section, index) => {
    const location = `sections[${index}]`;
    if (!isPlainObject(section)) {
      errors.push(`${location} must be an object.`);
      return;
    }
    checkAllowedKeys(section, SECTION_KEYS, location, errors);
    assertOptionalString(
      section.periodLabel,
      `${location}.periodLabel`,
      errors
    );
    assertWholeNumber(section.startDay, `${location}.startDay`, errors);
    assertWholeNumber(section.endDay, `${location}.endDay`, errors);

    const kind = section.kind;
    const instructions = section.homeCareInstructions;
    if (
      instructions !== undefined &&
      kind !== "HOME_CARE_PLAN" &&
      Array.isArray(instructions) &&
      instructions.length > 0
    ) {
      errors.push(
        `${location} includes home-care instructions. Only a HOME_CARE_PLAN section can contain them.`
      );
    }
    if (instructions === undefined) {
      return;
    }
    if (!Array.isArray(instructions)) {
      errors.push(`${location}.homeCareInstructions must be an array.`);
      return;
    }
    instructions.forEach((instruction, instructionIndex) => {
      const instructionLocation = `${location}.homeCareInstructions[${instructionIndex}]`;
      if (!isPlainObject(instruction)) {
        errors.push(`${instructionLocation} must be an object.`);
        return;
      }
      checkAllowedKeys(
        instruction,
        INSTRUCTION_KEYS,
        instructionLocation,
        errors
      );
      assertOptionalString(
        instruction.body,
        `${instructionLocation}.body`,
        errors
      );
      assertOptionalString(
        instruction.timingLabel,
        `${instructionLocation}.timingLabel`,
        errors
      );
      assertOptionalString(
        instruction.frequencyPeriod,
        `${instructionLocation}.frequencyPeriod`,
        errors
      );
      assertOptionalString(
        instruction.durationUnit,
        `${instructionLocation}.durationUnit`,
        errors
      );
      assertWholeNumber(
        instruction.frequencyCount,
        `${instructionLocation}.frequencyCount`,
        errors
      );
      assertWholeNumber(
        instruction.durationValue,
        `${instructionLocation}.durationValue`,
        errors
      );
    });
  });

  return errors;
}

function partialFromPayload(
  payload: Record<string, unknown>
): CanonicalTemplateImportPartial {
  const template = isPlainObject(payload.template) ? payload.template : null;
  const revision = isPlainObject(payload.revision) ? payload.revision : null;
  const sections =
    revision && Array.isArray(revision.sections) ? revision.sections : null;
  return {
    modeLabel: readString(payload.mode),
    title: template ? readString(template.title) : null,
    slug: template ? readString(template.slug) : null,
    serviceCategory: template ? readString(template.serviceCategory) : null,
    sectionCount: sections ? sections.length : null,
    homeCareInstructionCount: sections
      ? countHomeCareInstructions(sections)
      : null,
  };
}

function countHomeCareInstructions(sections: unknown[]): number {
  let total = 0;
  for (const section of sections) {
    if (!isPlainObject(section)) {
      continue;
    }
    const instructions = section.homeCareInstructions;
    if (!Array.isArray(instructions)) {
      continue;
    }
    total += instructions.length;
  }
  return total;
}

function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    return `${path}${issue.message}`;
  });
}

function modeError(mode: unknown): string | null {
  if (typeof mode !== "string" || !mode.trim()) {
    return "Import mode is required. Choose create, create-revision, or update-draft.";
  }
  if (isCanonicalTemplateImportMode(mode)) {
    return null;
  }
  if (mode === "upsert") {
    return 'Import mode "upsert" is not supported. Choose create, create-revision, or update-draft.';
  }
  if (
    mode === "publish" ||
    mode === "published" ||
    mode === "reviewed" ||
    mode === "approved"
  ) {
    return `Import mode "${mode}" is not supported. Import cannot review or publish. Choose create, create-revision, or update-draft.`;
  }
  return `Import mode "${mode}" is not supported. Choose create, create-revision, or update-draft.`;
}

function withImportSectionDefaults(section: unknown): unknown {
  if (!isPlainObject(section)) {
    return section;
  }
  const instructions = Array.isArray(section.homeCareInstructions)
    ? section.homeCareInstructions
    : [];
  return {
    periodLabel: null,
    startDay: null,
    endDay: null,
    ...section,
    homeCareInstructions: instructions.map((item) => {
      if (!isPlainObject(item)) {
        return item;
      }
      return {
        body: null,
        frequencyCount: null,
        frequencyPeriod: null,
        timingLabel: null,
        durationValue: null,
        durationUnit: null,
        ...item,
      };
    }),
  };
}

function collectSectionErrors(sections: unknown[]): string[] {
  if (sections.length > 40) {
    return ["A canonical draft can have at most 40 sections."];
  }
  const errors: string[] = [];
  sections.forEach((section, index) => {
    const parsed = guideSectionDraftSchema.safeParse(
      withImportSectionDefaults(section)
    );
    if (!parsed.success) {
      errors.push(
        ...formatZodIssues(parsed.error).map(
          (message) => `sections[${index}]: ${message}`
        )
      );
    }
  });
  return errors;
}

/**
 * Validates one import payload. Unsupported schema versions are rejected
 * before any other field is interpreted. Content rules are the canonical
 * draft rules used by the Operator editor.
 */
export function validateCanonicalTemplateImportPayload(
  payload: unknown
): CanonicalTemplateImportValidation {
  if (!isPlainObject(payload)) {
    return {
      ok: false,
      errors: ["Import payload must be a JSON object."],
      parsed: null,
      partial: emptyPartial(),
    };
  }

  if (payload.schemaVersion !== CANONICAL_TEMPLATE_IMPORT_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [unsupportedImportSchemaVersionMessage(payload.schemaVersion)],
      parsed: null,
      partial: emptyPartial(),
    };
  }

  const partial = partialFromPayload(payload);
  const shapeErrors = collectShapeErrors(payload);
  const declaredMode = modeError(payload.mode);
  if (declaredMode) {
    shapeErrors.unshift(declaredMode);
  }
  if (shapeErrors.length > 0) {
    return { ok: false, errors: shapeErrors, parsed: null, partial };
  }

  const identity = identitySchema.safeParse(payload);
  if (!identity.success) {
    return {
      ok: false,
      errors: formatZodIssues(identity.error),
      parsed: null,
      partial,
    };
  }

  const sections = identity.data.revision.sections;
  const sectionErrors = collectSectionErrors(sections);
  if (sectionErrors.length > 0) {
    return { ok: false, errors: sectionErrors, parsed: null, partial };
  }

  try {
    const parsedSections = parseCanonicalDraftSections(sections);
    return {
      ok: true,
      errors: [],
      parsed: {
        mode: identity.data.mode,
        template: {
          title: identity.data.template.title ?? null,
          slug: identity.data.template.slug,
          serviceCategory: identity.data.template.serviceCategory,
        },
        sections: parsedSections,
      },
      partial: {
        ...partial,
        title: identity.data.template.title ?? partial.title,
        slug: identity.data.template.slug,
        serviceCategory: identity.data.template.serviceCategory,
        sectionCount: parsedSections.length,
        homeCareInstructionCount: parsedSections.reduce(
          (total, section) => total + section.homeCareInstructions.length,
          0
        ),
      },
    };
  } catch (error) {
    const message = isCanonicalTemplateError(error)
      ? error.message
      : "That draft content is invalid.";
    return { ok: false, errors: [message], parsed: null, partial };
  }
}
