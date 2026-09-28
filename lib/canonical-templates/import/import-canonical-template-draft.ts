import "server-only";

import { GuideRevisionStatus, type Prisma } from "@prisma/client";

import { canonicalContentSignature } from "@/lib/canonical-templates/content";
import type { CanonicalContentSection } from "@/lib/canonical-templates/content";
import { isReservedDemoCanonicalSlug } from "@/lib/canonical-templates/constants";
import {
  canonicalTemplateTransactionOptions,
  throwCanonicalUniqueConflict,
} from "@/lib/canonical-templates/context";
import { createCanonicalTemplateInTransaction } from "@/lib/canonical-templates/create-canonical-template";
import { createCanonicalTemplateDraftInTransaction } from "@/lib/canonical-templates/create-canonical-template-draft";
import { CanonicalTemplateError } from "@/lib/canonical-templates/errors";
import {
  collectCanonicalImportFiles,
  parseCanonicalImportJson,
} from "@/lib/canonical-templates/import/files";
import { CanonicalTemplateImportError } from "@/lib/canonical-templates/import/errors";
import { lockCanonicalTemplate } from "@/lib/canonical-templates/locks";
import {
  IMPORT_REVIEW_CLEARED,
  IMPORT_REVIEW_KEPT,
  IMPORT_REVIEW_WILL_CLEAR,
  IMPORT_REVIEW_WILL_KEEP,
  IMPORT_SAMPLE_REFUSAL,
} from "@/lib/canonical-templates/import/messages";
import {
  validateCanonicalTemplateImportPayload,
  type CanonicalTemplateImportValidation,
  type ParsedCanonicalTemplateImport,
} from "@/lib/canonical-templates/import/schema";
import type { CanonicalTemplateImportReport } from "@/lib/canonical-templates/import/types";
import { canonicalTemplateSlugSchema } from "@/lib/canonical-templates/schemas";
import { saveCanonicalTemplateDraftInTransaction } from "@/lib/canonical-templates/save-canonical-template-draft";
import { getPrisma } from "@/lib/prisma";

/**
 * Draft-only canonical template import.
 *
 * Each payload is one database transaction. It uses the same
 * transaction-scoped lifecycle operations as Operator authoring:
 * createCanonicalTemplateInTransaction, createCanonicalTemplateDraftInTransaction,
 * and saveCanonicalTemplateDraftInTransaction. This module does not record
 * review or publish.
 */

const contentSectionSelect = {
  key: true,
  kind: true,
  title: true,
  body: true,
  periodLabel: true,
  startDay: true,
  endDay: true,
  sortOrder: true,
  homeCareInstructions: {
    orderBy: { sortOrder: "asc" as const },
    select: {
      key: true,
      title: true,
      body: true,
      frequencyCount: true,
      frequencyPeriod: true,
      timingLabel: true,
      durationValue: true,
      durationUnit: true,
      sortOrder: true,
    },
  },
} satisfies Prisma.GuideTemplateSectionSelect;

type ContentSectionRow = Prisma.GuideTemplateSectionGetPayload<{
  select: typeof contentSectionSelect;
}>;

interface ImportRevision {
  id: string;
  version: number;
  status: GuideRevisionStatus;
  reviewedAt: Date | null;
  sections: ContentSectionRow[];
}

interface ImportTarget {
  id: string;
  title: string;
  slug: string;
  serviceCategory: string;
  isSample: boolean;
  drafts: ImportRevision[];
  latestPublished: ImportRevision | null;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Canonical template import failed.";
}

function emptyReport(
  sourceLabel: string | null,
  overrides: Partial<CanonicalTemplateImportReport>
): CanonicalTemplateImportReport {
  return {
    sourceLabel,
    schemaValid: false,
    modeLabel: null,
    mode: null,
    title: null,
    slug: null,
    serviceCategory: null,
    sectionCount: null,
    homeCareInstructionCount: null,
    inspected: false,
    templateExists: false,
    openDraftExists: false,
    latestPublishedVersion: null,
    intendedDraftVersion: null,
    lifecycleConflicts: [],
    validationErrors: [],
    reviewNotice: null,
    outcome: "invalid",
    templateId: null,
    draftVersion: null,
    reviewCleared: false,
    reviewKept: false,
    failureMessage: null,
    failurePersisted: false,
    ...overrides,
  };
}

function toContentSections(
  sections: readonly ContentSectionRow[]
): CanonicalContentSection[] {
  return sections.map((section) => ({
    key: section.key,
    kind: section.kind,
    title: section.title,
    body: section.body,
    periodLabel: section.periodLabel,
    startDay: section.startDay,
    endDay: section.endDay,
    sortOrder: section.sortOrder,
    homeCareInstructions: section.homeCareInstructions.map((item) => ({
      key: item.key,
      title: item.title,
      body: item.body,
      frequencyCount: item.frequencyCount,
      frequencyPeriod: item.frequencyPeriod,
      timingLabel: item.timingLabel,
      durationValue: item.durationValue,
      durationUnit: item.durationUnit,
      sortOrder: item.sortOrder,
    })),
  }));
}

async function loadImportTarget(slug: string): Promise<ImportTarget | null> {
  const template = await getPrisma().guideTemplate.findUnique({
    where: { slug },
    select: {
      id: true,
      title: true,
      slug: true,
      serviceCategory: true,
      isSample: true,
      revisions: {
        select: {
          id: true,
          version: true,
          status: true,
          reviewedAt: true,
          sections: {
            orderBy: { sortOrder: "asc" },
            select: contentSectionSelect,
          },
        },
      },
    },
  });
  if (!template) {
    return null;
  }
  const drafts = template.revisions.filter(
    (revision) => revision.status === GuideRevisionStatus.DRAFT
  );
  const published = template.revisions
    .filter((revision) => revision.status === GuideRevisionStatus.PUBLISHED)
    .sort((left, right) => right.version - left.version);
  return {
    id: template.id,
    title: template.title,
    slug: template.slug,
    serviceCategory: template.serviceCategory,
    isSample: template.isSample,
    drafts,
    latestPublished: published[0] ?? null,
  };
}

function lifecycleConflicts(
  parsed: ParsedCanonicalTemplateImport,
  target: ImportTarget | null
): string[] {
  if (isReservedDemoCanonicalSlug(parsed.template.slug) || target?.isSample) {
    return [IMPORT_SAMPLE_REFUSAL];
  }

  const slug = parsed.template.slug;
  if (parsed.mode === "create") {
    return target
      ? [
          `A canonical template with slug "${slug}" already exists. create does not update it. Use create-revision or update-draft.`,
        ]
      : [];
  }

  if (!target) {
    return [
      `No canonical template exists for slug "${slug}". Use create to add a draft.`,
    ];
  }

  const conflicts: string[] = [];
  if (target.serviceCategory !== parsed.template.serviceCategory) {
    conflicts.push(
      `Import does not change service category. The payload says ${parsed.template.serviceCategory} and the existing template is ${target.serviceCategory}.`
    );
  }
  if (parsed.template.title && parsed.template.title !== target.title) {
    conflicts.push(
      `Import does not change the template title. The payload says "${parsed.template.title}" and the existing template title is "${target.title}".`
    );
  }

  if (parsed.mode === "create-revision") {
    if (target.drafts.length > 0) {
      conflicts.push(
        `Slug "${slug}" already has an open draft. create-revision will not replace it. Use update-draft, or abandon that draft in Operator Templates first.`
      );
    }
    if (!target.latestPublished) {
      conflicts.push(
        `create-revision needs a published revision of "${slug}". Publish the current draft in Operator Templates first.`
      );
    }
  }

  if (parsed.mode === "update-draft") {
    if (target.drafts.length === 0) {
      conflicts.push(
        target.latestPublished
          ? `Slug "${slug}" has no open draft. The latest published revision cannot be edited. Use create-revision.`
          : `Slug "${slug}" has no open draft to update.`
      );
    } else if (target.drafts.length > 1) {
      conflicts.push(
        `Slug "${slug}" has more than one open draft. Import will not choose one.`
      );
    }
  }

  return conflicts;
}

function intendedDraftVersion(
  parsed: ParsedCanonicalTemplateImport,
  target: ImportTarget | null,
  conflicts: readonly string[]
): number | null {
  if (conflicts.length > 0) {
    return null;
  }
  if (parsed.mode === "create") {
    return 1;
  }
  if (parsed.mode === "create-revision") {
    return target?.latestPublished ? target.latestPublished.version + 1 : null;
  }
  return target?.drafts.length === 1 ? target.drafts[0].version : null;
}

function dryRunReviewNotice(
  parsed: ParsedCanonicalTemplateImport,
  target: ImportTarget | null
): string | null {
  if (parsed.mode !== "update-draft" || target?.drafts.length !== 1) {
    return null;
  }
  const draft = target.drafts[0];
  if (!draft.reviewedAt) {
    return null;
  }
  const same =
    canonicalContentSignature(toContentSections(draft.sections)) ===
    canonicalContentSignature(parsed.sections);
  return same ? IMPORT_REVIEW_WILL_KEEP : IMPORT_REVIEW_WILL_CLEAR;
}

async function resolveImportOperator(email: string): Promise<{
  id: string;
  email: string;
}> {
  const users = await getPrisma().user.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true, platformRole: true },
  });
  if (users.length === 0) {
    throw new CanonicalTemplateImportError(
      `No user exists for ${email}.`,
      "actor"
    );
  }
  if (users.length > 1) {
    throw new CanonicalTemplateImportError(
      `More than one user matches ${email}.`,
      "actor"
    );
  }
  const user = users[0];
  if (!user || user.platformRole !== "OPERATOR") {
    throw new CanonicalTemplateImportError(
      `${user?.email ?? email} is not an Operator.`,
      "actor"
    );
  }
  return { id: user.id, email: user.email };
}

async function applyParsedImport(input: {
  parsed: ParsedCanonicalTemplateImport;
  actorUserId: string;
  target: ImportTarget | null;
}): Promise<{
  templateId: string;
  revisionId: string;
  version: number;
  reviewCleared: boolean;
  reviewKept: boolean;
}> {
  const { parsed, actorUserId, target } = input;
  if (isReservedDemoCanonicalSlug(parsed.template.slug) || target?.isSample) {
    throw new CanonicalTemplateImportError(IMPORT_SAMPLE_REFUSAL, "sample");
  }
  if (parsed.mode === "create" && !parsed.template.title) {
    throw new CanonicalTemplateImportError(
      "Enter a template title.",
      "invalid"
    );
  }
  if (parsed.mode !== "create" && !target) {
    throw new CanonicalTemplateImportError(
      `No canonical template exists for slug "${parsed.template.slug}". Use create to add a draft.`,
      "conflict"
    );
  }

  try {
    return await getPrisma().$transaction(async (tx) => {
      if (parsed.mode === "create") {
        const created = await createCanonicalTemplateInTransaction(tx, {
          actorUserId,
          title: parsed.template.title ?? "",
          slug: parsed.template.slug,
          serviceCategory: parsed.template.serviceCategory,
        });
        const saved = await saveCanonicalTemplateDraftInTransaction(tx, {
          templateId: created.templateId,
          revisionId: created.revisionId,
          actorUserId,
          sections: parsed.sections,
        });
        return {
          templateId: created.templateId,
          revisionId: saved.revisionId,
          version: created.version,
          reviewCleared: false,
          reviewKept: false,
        };
      }

      const existing = target;
      if (!existing) {
        throw new CanonicalTemplateImportError(
          `No canonical template exists for slug "${parsed.template.slug}". Use create to add a draft.`,
          "conflict"
        );
      }
      await lockCanonicalTemplate(tx, existing.id);

      if (parsed.mode === "create-revision") {
        const created = await createCanonicalTemplateDraftInTransaction(tx, {
          templateId: existing.id,
          actorUserId,
        });
        const saved = await saveCanonicalTemplateDraftInTransaction(tx, {
          templateId: existing.id,
          revisionId: created.revisionId,
          actorUserId,
          sections: parsed.sections,
        });
        return {
          templateId: existing.id,
          revisionId: saved.revisionId,
          version: created.version,
          reviewCleared: false,
          reviewKept: false,
        };
      }

      const draft = existing.drafts[0];
      if (!draft) {
        throw new CanonicalTemplateImportError(
          `Slug "${parsed.template.slug}" has no open draft. The latest published revision cannot be edited. Use create-revision.`,
          "conflict"
        );
      }
      const hadReview = draft.reviewedAt != null;
      const saved = await saveCanonicalTemplateDraftInTransaction(tx, {
        templateId: existing.id,
        revisionId: draft.id,
        actorUserId,
        sections: parsed.sections,
      });
      return {
        templateId: existing.id,
        revisionId: saved.revisionId,
        version: draft.version,
        reviewCleared: saved.reviewCleared,
        reviewKept: hadReview && !saved.reviewCleared,
      };
    }, canonicalTemplateTransactionOptions);
  } catch (error) {
    if (
      error instanceof CanonicalTemplateImportError ||
      error instanceof CanonicalTemplateError
    ) {
      throw error;
    }
    throwCanonicalUniqueConflict(error);
  }
}

async function assertImportedDraft(input: {
  revisionId: string;
  mode: ParsedCanonicalTemplateImport["mode"];
}): Promise<void> {
  const revision = await getPrisma().guideTemplateRevision.findUnique({
    where: { id: input.revisionId },
    select: {
      status: true,
      publishedAt: true,
      publishedByUserId: true,
      reviewerName: true,
      reviewedAt: true,
      reviewRecordedByUserId: true,
    },
  });
  if (
    !revision ||
    revision.status !== GuideRevisionStatus.DRAFT ||
    revision.publishedAt ||
    revision.publishedByUserId
  ) {
    throw new CanonicalTemplateImportError(
      "Import must not publish a canonical revision.",
      "failed"
    );
  }
  if (
    input.mode !== "update-draft" &&
    (revision.reviewerName ||
      revision.reviewedAt ||
      revision.reviewRecordedByUserId)
  ) {
    throw new CanonicalTemplateImportError(
      "Import must not record clinical review.",
      "failed"
    );
  }
}

function reportFromValidation(input: {
  sourceLabel: string | null;
  validation: CanonicalTemplateImportValidation;
  target: ImportTarget | null;
  inspected: boolean;
  conflicts: string[];
  extraErrors: string[];
  reviewNotice: string | null;
  intendedDraftVersion: number | null;
}): CanonicalTemplateImportReport {
  const { validation, target } = input;
  const title =
    validation.parsed?.template.title ??
    target?.title ??
    validation.partial.title;
  return emptyReport(input.sourceLabel, {
    schemaValid: validation.ok,
    modeLabel: validation.partial.modeLabel,
    mode: validation.parsed?.mode ?? null,
    title,
    slug: validation.parsed?.template.slug ?? validation.partial.slug,
    serviceCategory:
      validation.parsed?.template.serviceCategory ??
      validation.partial.serviceCategory,
    sectionCount: validation.partial.sectionCount,
    homeCareInstructionCount: validation.partial.homeCareInstructionCount,
    inspected: input.inspected,
    templateExists: input.inspected ? Boolean(target) : false,
    openDraftExists: input.inspected
      ? Boolean(target && target.drafts.length > 0)
      : false,
    latestPublishedVersion: target?.latestPublished?.version ?? null,
    intendedDraftVersion: input.intendedDraftVersion,
    lifecycleConflicts: input.conflicts,
    validationErrors: [...validation.errors, ...input.extraErrors],
    reviewNotice: input.reviewNotice,
    outcome: "invalid",
  });
}

export async function importCanonicalTemplateDraft(input: {
  payload: unknown;
  apply: boolean;
  operatorEmail?: string | null;
  sourceLabel?: string | null;
}): Promise<CanonicalTemplateImportReport> {
  const sourceLabel = input.sourceLabel ?? null;
  const validation = validateCanonicalTemplateImportPayload(input.payload);
  const slug =
    validation.parsed?.template.slug ?? validation.partial.slug ?? null;
  const slugIsLookupKey = canonicalTemplateSlugSchema.safeParse(slug).success;
  const target = slugIsLookupKey && slug ? await loadImportTarget(slug) : null;
  const inspected = slugIsLookupKey;
  const conflicts = validation.parsed
    ? lifecycleConflicts(validation.parsed, target)
    : [];
  const reviewNotice = validation.parsed
    ? dryRunReviewNotice(validation.parsed, target)
    : null;
  const nextVersion = validation.parsed
    ? intendedDraftVersion(validation.parsed, target, conflicts)
    : null;
  const extraErrors: string[] = [];

  let operator: { id: string; email: string } | null = null;
  const operatorEmail = input.operatorEmail?.trim() ?? "";
  if (input.apply && !operatorEmail) {
    extraErrors.push(
      "Apply requires --operator-email for an existing Operator. Import does not choose an actor."
    );
  } else if (operatorEmail) {
    try {
      operator = await resolveImportOperator(operatorEmail);
    } catch (error) {
      extraErrors.push(messageOf(error));
    }
  }

  const blocked =
    !validation.ok || conflicts.length > 0 || extraErrors.length > 0;
  const preview = reportFromValidation({
    sourceLabel,
    validation,
    target,
    inspected,
    conflicts,
    extraErrors,
    reviewNotice,
    intendedDraftVersion: nextVersion,
  });
  if (blocked || !validation.parsed) {
    return preview;
  }
  if (!input.apply) {
    return { ...preview, outcome: "valid" };
  }
  if (!operator) {
    return preview;
  }

  const baseContext = {
    sourceLabel,
    validation,
    target,
    inspected,
    conflicts,
    extraErrors,
    reviewNotice,
    intendedDraftVersion: nextVersion,
  };
  let applied: Awaited<ReturnType<typeof applyParsedImport>>;
  try {
    applied = await applyParsedImport({
      parsed: validation.parsed,
      actorUserId: operator.id,
      target,
    });
  } catch (error) {
    return {
      ...reportFromValidation(baseContext),
      outcome: "failed",
      failureMessage: messageOf(error),
      failurePersisted: false,
    };
  }

  try {
    await assertImportedDraft({
      revisionId: applied.revisionId,
      mode: validation.parsed.mode,
    });
  } catch (error) {
    return {
      ...reportFromValidation(baseContext),
      outcome: "failed",
      templateId: applied.templateId,
      draftVersion: applied.version,
      failureMessage: messageOf(error),
      failurePersisted: true,
    };
  }

  return {
    ...reportFromValidation({
      ...baseContext,
      reviewNotice: applied.reviewCleared
        ? IMPORT_REVIEW_CLEARED
        : applied.reviewKept
          ? IMPORT_REVIEW_KEPT
          : null,
      intendedDraftVersion: applied.version,
    }),
    outcome: "applied",
    templateId: applied.templateId,
    draftVersion: applied.version,
    reviewCleared: applied.reviewCleared,
    reviewKept: applied.reviewKept,
    openDraftExists: true,
    templateExists: true,
  };
}

function invalidFileReport(
  label: string,
  error: string
): CanonicalTemplateImportReport {
  return emptyReport(label, {
    validationErrors: [error],
    outcome: "invalid",
  });
}

export async function importCanonicalTemplateFiles(input: {
  targets: readonly string[];
  apply: boolean;
  operatorEmail?: string | null;
}): Promise<CanonicalTemplateImportReport[]> {
  const files = await collectCanonicalImportFiles(input.targets);
  const reports: CanonicalTemplateImportReport[] = [];
  for (const file of files) {
    if (file.error || file.text === null) {
      reports.push(
        invalidFileReport(
          file.label,
          file.error ?? `Import file "${file.label}" could not be read.`
        )
      );
      continue;
    }
    let payload: unknown;
    try {
      payload = parseCanonicalImportJson(file.text);
    } catch {
      reports.push(
        invalidFileReport(file.label, `File "${file.label}" is not valid JSON.`)
      );
      continue;
    }
    reports.push(
      await importCanonicalTemplateDraft({
        payload,
        apply: input.apply,
        operatorEmail: input.operatorEmail,
        sourceLabel: file.label,
      })
    );
  }
  return reports;
}
