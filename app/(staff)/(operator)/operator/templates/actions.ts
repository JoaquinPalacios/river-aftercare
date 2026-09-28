"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import { abandonCanonicalTemplateDraft } from "@/lib/canonical-templates/abandon-canonical-template-draft";
import { createCanonicalTemplateDraft } from "@/lib/canonical-templates/create-canonical-template-draft";
import { createCanonicalTemplate } from "@/lib/canonical-templates/create-canonical-template";
import { isCanonicalTemplateError } from "@/lib/canonical-templates/errors";
import { publishCanonicalTemplateRevision } from "@/lib/canonical-templates/publish-canonical-template-revision";
import { recordCanonicalTemplateReview } from "@/lib/canonical-templates/record-canonical-template-review";
import { saveCanonicalTemplateDraft } from "@/lib/canonical-templates/save-canonical-template-draft";
import {
  createCanonicalTemplateSchema,
  recordCanonicalTemplateReviewSchema,
  updateCanonicalTemplateMetadataSchema,
} from "@/lib/canonical-templates/schemas";
import {
  deactivateCanonicalTemplate,
  reactivateCanonicalTemplate,
} from "@/lib/canonical-templates/set-canonical-template-activation";
import { updateCanonicalTemplateMetadata } from "@/lib/canonical-templates/update-canonical-template-metadata";

export interface CanonicalTemplateActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
  reviewCleared?: boolean;
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

function actionError(error: unknown): string {
  if (isCanonicalTemplateError(error)) {
    return error.message;
  }
  return "That template change could not be saved.";
}

function revalidateTemplate(templateId?: string) {
  revalidatePath("/operator/templates");
  if (templateId) {
    revalidatePath(`/operator/templates/${templateId}`);
    revalidatePath(`/operator/templates/${templateId}/draft`);
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
    redirect(`/operator/templates/${created.templateId}/draft`);
  } catch (error) {
    rethrowNavigation(error);
    return { error: actionError(error) };
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
  const parsed = updateCanonicalTemplateMetadataSchema.safeParse({
    actorUserId: user.id,
    templateId,
    title: formData.get("title") ?? "",
    ...(typeof slug === "string" ? { slug } : {}),
    ...(typeof serviceCategory === "string" ? { serviceCategory } : {}),
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
    const saved = await saveCanonicalTemplateDraft({
      templateId,
      revisionId,
      actorUserId: user.id,
      sections,
    });
    revalidateTemplate(templateId);
    return { ok: true, reviewCleared: saved.reviewCleared };
  } catch (error) {
    rethrowNavigation(error);
    return { error: actionError(error) };
  }
}

export async function recordCanonicalTemplateReviewAction(
  _previous: CanonicalTemplateActionState,
  formData: FormData
): Promise<CanonicalTemplateActionState> {
  const { user } = await requirePlatformOperator();
  const parsed = recordCanonicalTemplateReviewSchema.safeParse({
    actorUserId: user.id,
    templateId: templateIdFrom(formData),
    revisionId: String(formData.get("revisionId") ?? ""),
    reviewerName: formData.get("reviewerName") ?? "",
    reviewerCredential: formData.get("reviewerCredential") ?? "",
    reviewNote: formData.get("reviewNote") ?? "",
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the review details.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  try {
    await recordCanonicalTemplateReview(parsed.data);
    revalidateTemplate(parsed.data.templateId);
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
    redirect(`/operator/templates/${templateId}?notice=published`);
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
