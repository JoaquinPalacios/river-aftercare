"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import { abandonCanonicalTemplateDraft } from "@/lib/canonical-templates/abandon-canonical-template-draft";
import {
  deactivateCanonicalTemplates,
  deleteNeverPublishedCanonicalTemplates,
  publishCanonicalTemplates,
  reactivateCanonicalTemplates,
} from "@/lib/canonical-templates/bulk-canonical-template-lifecycle";
import { createCanonicalTemplateDraft } from "@/lib/canonical-templates/create-canonical-template-draft";
import { createCanonicalTemplate } from "@/lib/canonical-templates/create-canonical-template";
import { duplicateCanonicalTemplate } from "@/lib/canonical-templates/duplicate-canonical-template";
import {
  CanonicalTemplateError,
  isBulkCanonicalTemplateError,
  isCanonicalTemplateError,
} from "@/lib/canonical-templates/errors";
import { publishCanonicalTemplateRevision } from "@/lib/canonical-templates/publish-canonical-template-revision";
import { saveCanonicalTemplateDraft } from "@/lib/canonical-templates/save-canonical-template-draft";
import {
  createCanonicalTemplateSchema,
  duplicateCanonicalTemplateSchema,
  updateCanonicalTemplateMetadataSchema,
} from "@/lib/canonical-templates/schemas";
import {
  deactivateCanonicalTemplate,
  reactivateCanonicalTemplate,
} from "@/lib/canonical-templates/set-canonical-template-activation";
import { updateCanonicalTemplateMetadata } from "@/lib/canonical-templates/update-canonical-template-metadata";
import { adoptPublishedSampleForDesignatedDemo } from "@/lib/demo-adoption/adopt-demo-sample-revision";
import { isClinicPortalError } from "@/lib/clinic-portal/errors";
import { safeStaffReturnPath } from "@/lib/staff/safe-return-path";

export interface CanonicalTemplateActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
  message?: string;
}

function rethrowNavigation(error: unknown): void {
  if (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    (error.digest.startsWith("NEXT_REDIRECT") ||
      error.digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"))
  ) {
    throw error;
  }
}

function fieldErrorsFrom(
  issues: { path: PropertyKey[]; message: string }[]
): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }
  return fieldErrors;
}

function duplicateFailureState(error: unknown): CanonicalTemplateActionState {
  if (!isCanonicalTemplateError(error)) {
    return { error: actionError(error) };
  }
  if (error.message === "That slug is already used.") {
    return { error: error.message, fieldErrors: { slug: error.message } };
  }
  if (error.message.includes("active sample")) {
    return {
      error: error.message,
      fieldErrors: { classification: error.message },
    };
  }
  return { error: error.message };
}

function actionError(error: unknown): string {
  if (
    isBulkCanonicalTemplateError(error) ||
    isCanonicalTemplateError(error) ||
    isClinicPortalError(error)
  ) {
    return error.message;
  }
  return "That template change could not be saved.";
}

function bulkResultMessage(verb: string, count: number): string {
  return `${count} ${count === 1 ? "template" : "templates"} ${verb}.`;
}

function parseBulkJson(formData: FormData): unknown {
  try {
    return JSON.parse(String(formData.get("templates") ?? ""));
  } catch {
    throw new CanonicalTemplateError(
      "Those templates could not be updated.",
      "invalid"
    );
  }
}

function bulkTemplateIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new CanonicalTemplateError(
      "Those templates could not be updated.",
      "invalid"
    );
  }
  return value.map((item) => {
    if (!item || typeof item !== "object") {
      throw new CanonicalTemplateError(
        "Those templates could not be updated.",
        "invalid"
      );
    }
    const templateId = String(
      (item as { templateId?: unknown }).templateId ?? ""
    ).trim();
    if (!templateId) {
      throw new CanonicalTemplateError(
        "Those templates could not be updated.",
        "invalid"
      );
    }
    return templateId;
  });
}

function bulkPublishTargets(value: unknown): {
  templateId: string;
  revisionId: string;
  expectedVersion: number;
}[] {
  if (!Array.isArray(value)) {
    throw new CanonicalTemplateError(
      "Those templates could not be updated.",
      "invalid"
    );
  }
  return value.map((item) => {
    if (!item || typeof item !== "object") {
      throw new CanonicalTemplateError(
        "Those templates could not be updated.",
        "invalid"
      );
    }
    const record = item as {
      templateId?: unknown;
      revisionId?: unknown;
      expectedVersion?: unknown;
    };
    const templateId = String(record.templateId ?? "").trim();
    const revisionId = String(record.revisionId ?? "").trim();
    const expectedVersion = Number(record.expectedVersion);
    if (!templateId || !revisionId || !Number.isInteger(expectedVersion)) {
      throw new CanonicalTemplateError(
        "Those templates could not be updated.",
        "invalid"
      );
    }
    return { templateId, revisionId, expectedVersion };
  });
}

function revalidateTemplate(templateId?: string) {
  revalidatePath("/operator/templates");
  if (templateId) {
    revalidatePath(`/operator/templates/${templateId}`);
    revalidatePath(`/operator/templates/${templateId}/draft`);
    revalidatePath(`/operator/templates/${templateId}/preview`);
  }
}

function templateIdFrom(formData: FormData): string {
  return String(formData.get("templateId") ?? "").trim();
}

export async function createCanonicalTemplateAction(
  _previous: CanonicalTemplateActionState,
  formData: FormData
): Promise<CanonicalTemplateActionState> {
  const { user } = await requirePlatformOperator();
  const parsed = createCanonicalTemplateSchema.safeParse({
    actorUserId: user.id,
    title: formData.get("title") ?? "",
    slug: formData.get("slug") ?? "",
    serviceCategory: formData.get("serviceCategory") ?? "",
    classification: formData.get("classification") ?? "PRODUCTION",
  });
  if (!parsed.success) {
    return {
      error: "Check the template details.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  try {
    const created = await createCanonicalTemplate(parsed.data);
    revalidateTemplate(created.templateId);
    const next = safeStaffReturnPath(formData.get("next"));
    redirect(next ?? `/operator/templates/${created.templateId}/draft`);
  } catch (error) {
    rethrowNavigation(error);
    return { error: actionError(error) };
  }
}

export async function duplicateCanonicalTemplateAction(
  _previous: CanonicalTemplateActionState,
  formData: FormData
): Promise<CanonicalTemplateActionState> {
  const { user } = await requirePlatformOperator();
  const parsed = duplicateCanonicalTemplateSchema.safeParse({
    actorUserId: user.id,
    sourceTemplateId: formData.get("sourceTemplateId") ?? "",
    title: formData.get("title") ?? "",
    slug: formData.get("slug") ?? "",
    serviceCategory: formData.get("serviceCategory") ?? "",
    classification: formData.get("classification") ?? "",
  });
  if (!parsed.success) {
    return {
      error: "Check the template details.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  try {
    const created = await duplicateCanonicalTemplate(parsed.data);
    revalidateTemplate(parsed.data.sourceTemplateId);
    revalidateTemplate(created.templateId);
    redirect(
      `/operator/templates/${created.templateId}/draft?notice=duplicated`
    );
  } catch (error) {
    rethrowNavigation(error);
    return duplicateFailureState(error);
  }
}

export async function updateCanonicalTemplateMetadataAction(
  _previous: CanonicalTemplateActionState,
  formData: FormData
): Promise<CanonicalTemplateActionState> {
  const { user } = await requirePlatformOperator();
  const templateId = templateIdFrom(formData);
  const slug = formData.get("slug");
  const serviceCategory = formData.get("serviceCategory");
  const classification = formData.get("classification");
  const parsed = updateCanonicalTemplateMetadataSchema.safeParse({
    actorUserId: user.id,
    templateId,
    title: formData.get("title") ?? "",
    ...(typeof slug === "string" ? { slug } : {}),
    ...(typeof serviceCategory === "string" ? { serviceCategory } : {}),
    ...(typeof classification === "string" ? { classification } : {}),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the template details.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  try {
    await updateCanonicalTemplateMetadata(parsed.data);
    revalidateTemplate(templateId);
    return { ok: true };
  } catch (error) {
    rethrowNavigation(error);
    return { error: actionError(error) };
  }
}

export async function saveCanonicalTemplateDraftAction(
  _previous: CanonicalTemplateActionState,
  formData: FormData
): Promise<CanonicalTemplateActionState> {
  const { user } = await requirePlatformOperator();
  const templateId = templateIdFrom(formData);
  const revisionId = String(formData.get("revisionId") ?? "").trim();
  let sections: unknown;
  try {
    sections = JSON.parse(String(formData.get("sections") ?? ""));
  } catch {
    return { error: "That draft content is invalid." };
  }

  try {
    await saveCanonicalTemplateDraft({
      templateId,
      revisionId,
      actorUserId: user.id,
      sections,
    });
    revalidateTemplate(templateId);
    return { ok: true };
  } catch (error) {
    rethrowNavigation(error);
    return { error: actionError(error) };
  }
}

export async function publishCanonicalTemplateRevisionAction(
  _previous: CanonicalTemplateActionState,
  formData: FormData
): Promise<CanonicalTemplateActionState> {
  const { user } = await requirePlatformOperator();
  const templateId = templateIdFrom(formData);
  const revisionId = String(formData.get("revisionId") ?? "").trim();
  const expectedVersion = Number(formData.get("expectedVersion"));

  try {
    await publishCanonicalTemplateRevision({
      templateId,
      revisionId,
      actorUserId: user.id,
      expectedVersion,
    });
    revalidateTemplate(templateId);
    redirect(`/operator/templates/${templateId}/draft?notice=published`);
  } catch (error) {
    rethrowNavigation(error);
    return { error: actionError(error) };
  }
}

export async function createCanonicalTemplateDraftAction(
  _previous: CanonicalTemplateActionState,
  formData: FormData
): Promise<CanonicalTemplateActionState> {
  const { user } = await requirePlatformOperator();
  const templateId = templateIdFrom(formData);

  try {
    await createCanonicalTemplateDraft({
      templateId,
      actorUserId: user.id,
    });
    revalidateTemplate(templateId);
    redirect(`/operator/templates/${templateId}/draft?notice=revision-opened`);
  } catch (error) {
    rethrowNavigation(error);
    if (
      isCanonicalTemplateError(error) &&
      error.message === "This template already has an open draft."
    ) {
      revalidateTemplate(templateId);
      redirect(`/operator/templates/${templateId}/draft?notice=draft-exists`);
    }
    return { error: actionError(error) };
  }
}

export async function abandonCanonicalTemplateDraftAction(
  _previous: CanonicalTemplateActionState,
  formData: FormData
): Promise<CanonicalTemplateActionState> {
  const { user } = await requirePlatformOperator();
  const templateId = templateIdFrom(formData);
  const revisionId = String(formData.get("revisionId") ?? "").trim();

  try {
    const result = await abandonCanonicalTemplateDraft({
      templateId,
      revisionId,
      actorUserId: user.id,
    });
    revalidateTemplate(templateId);
    if (result.deletedTemplate) {
      redirect("/operator/templates?notice=template-removed");
    }
    redirect(`/operator/templates/${templateId}?notice=draft-abandoned`);
  } catch (error) {
    rethrowNavigation(error);
    return { error: actionError(error) };
  }
}

export async function deactivateCanonicalTemplateAction(
  _previous: CanonicalTemplateActionState,
  formData: FormData
): Promise<CanonicalTemplateActionState> {
  const { user } = await requirePlatformOperator();
  const templateId = templateIdFrom(formData);

  try {
    await deactivateCanonicalTemplate({
      templateId,
      actorUserId: user.id,
    });
    revalidateTemplate(templateId);
    redirect(`/operator/templates/${templateId}?notice=deactivated`);
  } catch (error) {
    rethrowNavigation(error);
    return { error: actionError(error) };
  }
}

export async function applyCanonicalTemplateBulkAction(
  _previous: CanonicalTemplateActionState,
  formData: FormData
): Promise<CanonicalTemplateActionState> {
  const { user } = await requirePlatformOperator();
  const operation = String(formData.get("operation") ?? "");

  try {
    const payload = parseBulkJson(formData);
    if (operation === "publish") {
      const result = await publishCanonicalTemplates({
        actorUserId: user.id,
        templates: bulkPublishTargets(payload),
      });
      revalidateTemplate();
      return {
        ok: true,
        message: bulkResultMessage("published", result.count),
      };
    }
    if (operation === "deactivate") {
      const result = await deactivateCanonicalTemplates({
        actorUserId: user.id,
        templateIds: bulkTemplateIds(payload),
      });
      revalidateTemplate();
      return {
        ok: true,
        message: bulkResultMessage("deactivated", result.count),
      };
    }
    if (operation === "reactivate") {
      const result = await reactivateCanonicalTemplates({
        actorUserId: user.id,
        templateIds: bulkTemplateIds(payload),
      });
      revalidateTemplate();
      return {
        ok: true,
        message: bulkResultMessage("reactivated", result.count),
      };
    }
    if (operation === "delete") {
      const result = await deleteNeverPublishedCanonicalTemplates({
        actorUserId: user.id,
        templateIds: bulkTemplateIds(payload),
      });
      revalidateTemplate();
      return { ok: true, message: bulkResultMessage("deleted", result.count) };
    }
    return { error: "Those templates could not be updated." };
  } catch (error) {
    rethrowNavigation(error);
    return { error: actionError(error) };
  }
}

export async function updateLiveDemoAction(
  _previous: CanonicalTemplateActionState,
  formData: FormData
): Promise<CanonicalTemplateActionState> {
  const { user } = await requirePlatformOperator();
  const templateId = templateIdFrom(formData);
  const canonicalRevisionId = String(
    formData.get("canonicalRevisionId") ?? ""
  ).trim();
  if (!canonicalRevisionId) {
    return { error: "Choose a published sample revision before updating." };
  }

  try {
    const result = await adoptPublishedSampleForDesignatedDemo({
      actorUserId: user.id,
      templateId,
      canonicalRevisionId,
      expectedPinnedRevisionId: optionalFormId(
        formData.get("expectedPinnedRevisionId")
      ),
      expectedPublishedPracticeGuideRevisionId: optionalFormId(
        formData.get("expectedPublishedPracticeGuideRevisionId")
      ),
    });
    revalidateTemplate(templateId);
    redirect(
      `/operator/templates/${templateId}?notice=${
        result.status === "current" ? "demo-current" : "demo-updated"
      }`
    );
  } catch (error) {
    rethrowNavigation(error);
    return { error: actionError(error) };
  }
}

function optionalFormId(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

export async function reactivateCanonicalTemplateAction(
  _previous: CanonicalTemplateActionState,
  formData: FormData
): Promise<CanonicalTemplateActionState> {
  const { user } = await requirePlatformOperator();
  const templateId = templateIdFrom(formData);

  try {
    await reactivateCanonicalTemplate({
      templateId,
      actorUserId: user.id,
    });
    revalidateTemplate(templateId);
    redirect(`/operator/templates/${templateId}?notice=reactivated`);
  } catch (error) {
    rethrowNavigation(error);
    return { error: actionError(error) };
  }
}
