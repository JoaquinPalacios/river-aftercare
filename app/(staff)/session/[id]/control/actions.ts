"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireStaffSession } from "@/lib/auth/require-staff-session";
import { enforcePrePaymentActivationGate } from "@/lib/billing/activation-gate";
import { completeProcedureSession } from "@/lib/sessions/complete-procedure-session";
import {
  SessionNotFoundError,
  SessionNotTransitionableError,
} from "@/lib/sessions/errors";
import {
  moveProcedureSessionStage,
  type MoveStageDirection,
} from "@/lib/sessions/move-procedure-session-stage";

export async function completeSessionAction(formData: FormData): Promise<void> {
  const { clinicMembership } = await requireStaffSession();
  await enforcePrePaymentActivationGate(clinicMembership);

  if (!clinicMembership) {
    notFound();
  }

  const sessionId = formData.get("sessionId");

  if (typeof sessionId !== "string" || sessionId.length === 0) {
    notFound();
  }

  try {
    await completeProcedureSession({
      sessionId,
      clinicId: clinicMembership.clinic.id,
    });
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      notFound();
    }

    throw error;
  }

  redirect("/dashboard");
}

export async function moveStageAction(formData: FormData): Promise<void> {
  const { user, clinicMembership } = await requireStaffSession();
  await enforcePrePaymentActivationGate(clinicMembership);

  if (!clinicMembership) {
    notFound();
  }

  const sessionId = formData.get("sessionId");
  const direction = formData.get("direction");

  if (typeof sessionId !== "string" || sessionId.length === 0) {
    notFound();
  }

  if (direction !== "NEXT" && direction !== "PREVIOUS") {
    notFound();
  }

  try {
    await moveProcedureSessionStage({
      sessionId,
      clinicId: clinicMembership.clinic.id,
      direction: direction as MoveStageDirection,
      actorUserId: user.id,
    });
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      notFound();
    }

    if (error instanceof SessionNotTransitionableError) {
      redirect("/dashboard");
    }

    throw error;
  }

  revalidatePath(`/session/${sessionId}/control`);
}
