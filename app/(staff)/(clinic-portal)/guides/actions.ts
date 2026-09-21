"use server";

import { redirect } from "next/navigation";

import { requireClinicAdmin } from "@/lib/auth/require-clinic-admin";
import { enforcePrePaymentActivationGate } from "@/lib/billing/activation-gate";
import { fieldErrorsFromZod } from "@/lib/clinic-portal/field-errors";
import {
  createCustomPracticeGuide,
  createPracticeGuideFromTemplate,
} from "@/lib/clinic-portal/create-practice-guide";
import { deletePracticeGuide } from "@/lib/clinic-portal/delete-practice-guide-draft";
import { discardPracticeGuideDraftChanges } from "@/lib/clinic-portal/discard-practice-guide-draft-changes";
import { isClinicPortalError } from "@/lib/clinic-portal/errors";
import { loadPracticeGuideEditor } from "@/lib/clinic-portal/load-practice-guide-editor";
import {
  createCustomGuideSchema,
  createTemplateGuideSchema,
  saveGuideDraftSchema,
} from "@/lib/clinic-portal/guide-schemas";
import { publishPracticeGuide } from "@/lib/clinic-portal/publish-practice-guide";
import { savePracticeGuideDraft } from "@/lib/clinic-portal/save-practice-guide-draft";
import { unpublishPracticeGuide } from "@/lib/clinic-portal/unpublish-practice-guide";
import { revalidatePath } from "next/cache";

import type { ComposedGuideSection } from "@/lib/aftercare/types";

export interface GuideActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
  restored?: {
    title: string;
    publicSlug: string;
    introduction: string;
    sections: ComposedGuideSection[];
  };
}

async function requireGuideAdmin() {
  const session = await requireClinicAdmin();
  await enforcePrePaymentActivationGate(session.clinicMembership);
  return session;
}

function errorState(error: unknown): GuideActionState {
  if (isClinicPortalError(error)) {
    return { error: error.message };
  }

  return { error: "Something went wrong. Try again." };
}

export async function createGuideFromTemplateAction(
  _previous: GuideActionState,
  formData: FormData
): Promise<GuideActionState> {
  const { user, clinicMembership } = await requireGuideAdmin();
  const parsed = createTemplateGuideSchema.safeParse({
    templateId: formData.get("templateId") ?? "",
    publicSlug: formData.get("publicSlug") || undefined,
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Choose a template.",
    };
  }

  try {
    const created = await createPracticeGuideFromTemplate({
      clinicId: clinicMembership.clinic.id,
      actorUserId: user.id,
      values: parsed.data,
    });
    redirect(`/guides/${created.id}/edit`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    return errorState(error);
  }
}

export async function createCustomGuideAction(
  _previous: GuideActionState,
  formData: FormData
): Promise<GuideActionState> {
  const { user, clinicMembership } = await requireGuideAdmin();
  const parsed = createCustomGuideSchema.safeParse({
    title: formData.get("title") ?? "",
    publicSlug: formData.get("publicSlug") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
    return { error: "Please review the form and try again.", fieldErrors };
  }

  try {
    const created = await createCustomPracticeGuide({
      clinicId: clinicMembership.clinic.id,
      actorUserId: user.id,
      values: parsed.data,
    });
    redirect(`/guides/${created.id}/edit`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    return errorState(error);
  }
}

export async function saveGuideDraftAction(
  _previous: GuideActionState,
  formData: FormData
): Promise<GuideActionState> {
  const { user, clinicMembership } = await requireGuideAdmin();
  const rawSections = formData.get("sections");
  let sections: unknown = [];
  if (typeof rawSections === "string") {
    try {
      sections = JSON.parse(rawSections);
    } catch {
      return { error: "The guide draft could not be read. Try again." };
    }
  }

  const parsed = saveGuideDraftSchema.safeParse({
    guideId: formData.get("guideId") ?? "",
    title: formData.get("title") ?? "",
    publicSlug: formData.get("publicSlug") ?? "",
    introduction: formData.get("introduction") ?? "",
    sections,
  });

  if (!parsed.success) {
    return {
      error: "Please review the form and try again.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  try {
    await savePracticeGuideDraft({
      clinicId: clinicMembership.clinic.id,
      actorUserId: user.id,
      values: parsed.data,
    });
    return { ok: true };
  } catch (error) {
    return errorState(error);
  }
}

export async function publishGuideAction(
  _previous: GuideActionState,
  formData: FormData
): Promise<GuideActionState> {
  const { user, clinicMembership } = await requireGuideAdmin();
  const guideId = String(formData.get("guideId") ?? "");
  if (!guideId) {
    return { error: "Missing guide." };
  }

  try {
    await publishPracticeGuide({
      clinicId: clinicMembership.clinic.id,
      actorUserId: user.id,
      guideId,
      reviewAttested: String(formData.get("reviewAttested") ?? ""),
    });
    return { ok: true };
  } catch (error) {
    return errorState(error);
  }
}

export async function deleteGuideAction(
  _previous: GuideActionState,
  formData: FormData
): Promise<GuideActionState> {
  const { user, clinicMembership } = await requireGuideAdmin();
  const guideId = String(formData.get("guideId") ?? "");
  if (!guideId) {
    return { error: "Missing guide." };
  }

  try {
    await deletePracticeGuide({
      clinicId: clinicMembership.clinic.id,
      actorUserId: user.id,
      guideId,
    });
    revalidatePath("/guides");
    redirect("/guides");
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    return errorState(error);
  }
}

export async function discardGuideDraftChangesAction(
  _previous: GuideActionState,
  formData: FormData
): Promise<GuideActionState> {
  const { user, clinicMembership } = await requireGuideAdmin();
  const guideId = String(formData.get("guideId") ?? "");
  if (!guideId) {
    return { error: "Missing guide." };
  }

  try {
    await discardPracticeGuideDraftChanges({
      clinicId: clinicMembership.clinic.id,
      actorUserId: user.id,
      guideId,
    });
    const editor = await loadPracticeGuideEditor({
      clinicId: clinicMembership.clinic.id,
      guideId,
    });
    revalidatePath("/guides");
    revalidatePath(`/guides/${guideId}/edit`);
    return {
      ok: true,
      restored: {
        title: editor.title,
        publicSlug: editor.publicSlug,
        introduction: editor.introduction ?? "",
        sections: editor.sections,
      },
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function unpublishGuideAction(
  _previous: GuideActionState,
  formData: FormData
): Promise<GuideActionState> {
  const { user, clinicMembership } = await requireGuideAdmin();
  const guideId = String(formData.get("guideId") ?? "");
  if (!guideId) {
    return { error: "Missing guide." };
  }

  try {
    await unpublishPracticeGuide({
      clinicId: clinicMembership.clinic.id,
      actorUserId: user.id,
      guideId,
    });
    revalidatePath("/guides");
    revalidatePath(`/guides/${guideId}/edit`);
    return { ok: true };
  } catch (error) {
    return errorState(error);
  }
}

function isRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}
