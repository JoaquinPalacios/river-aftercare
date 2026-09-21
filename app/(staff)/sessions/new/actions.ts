"use server";

import { redirect } from "next/navigation";

import { requireStaffSession } from "@/lib/auth/require-staff-session";
import { enforcePrePaymentActivationGate } from "@/lib/billing/activation-gate";
import { createProcedureSession } from "@/lib/sessions/create-procedure-session";
import {
  InvalidSelectedAreaOptionError,
  MissingSelectedAreaOptionError,
  SessionCreationError,
  UnexpectedSelectedAreaOptionError,
} from "@/lib/sessions/errors";
import { createSessionSchema } from "@/app/(staff)/sessions/new/schema";
import type { CreateSessionActionState } from "@/app/(staff)/sessions/new/state";

export async function createSessionAction(
  _previousState: CreateSessionActionState,
  formData: FormData
): Promise<CreateSessionActionState> {
  const { clinicMembership } = await requireStaffSession();
  await enforcePrePaymentActivationGate(clinicMembership);

  if (!clinicMembership) {
    return {
      error: "Your account is no longer linked to a clinic.",
      fieldErrors: {},
    };
  }

  const parsed = createSessionSchema.safeParse({
    roomId: formData.get("roomId") ?? "",
    doctorId: formData.get("doctorId") ?? "",
    procedureTemplateId: formData.get("procedureTemplateId") ?? "",
    selectedAreaOptionId: formData.get("selectedAreaOptionId") ?? "",
    displayMode: formData.get("displayMode") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: Partial<Record<string, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }

    return {
      error: "Please review the form and try again.",
      fieldErrors,
    };
  }

  let sessionId: string;

  try {
    const result = await createProcedureSession({
      clinicId: clinicMembership.clinic.id,
      roomId: parsed.data.roomId,
      doctorId: parsed.data.doctorId,
      procedureTemplateId: parsed.data.procedureTemplateId,
      selectedAreaOptionId: parsed.data.selectedAreaOptionId,
      displayMode: parsed.data.displayMode,
    });
    sessionId = result.sessionId;
  } catch (error) {
    if (
      error instanceof MissingSelectedAreaOptionError ||
      error instanceof InvalidSelectedAreaOptionError ||
      error instanceof UnexpectedSelectedAreaOptionError
    ) {
      return {
        error: null,
        fieldErrors: { selectedAreaOptionId: error.message },
      };
    }

    if (error instanceof SessionCreationError) {
      return {
        error: error.message,
        fieldErrors: {},
      };
    }

    throw error;
  }

  redirect(`/session/${sessionId}/control`);
}
