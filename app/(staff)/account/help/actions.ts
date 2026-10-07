"use server";

import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { requireStaffSession } from "@/lib/auth/require-staff-session";
import { reportSupportEmailFailure } from "@/lib/observability/report-server-exception";
import {
  deliverHelpFeedback,
  logHelpFeedbackFailure,
} from "@/lib/support/help-feedback-mail";
import {
  HELP_FEEDBACK_DELIVERY_FAILED,
  HELP_FEEDBACK_REVIEW_FIELDS,
  readHelpFeedbackForm,
  type HelpFeedbackCategory,
  type HelpFeedbackFieldErrors,
} from "@/lib/support/help-feedback-fields";
import {
  helpFeedbackFieldErrors,
  helpFeedbackSchema,
} from "@/lib/support/help-feedback-schema";
import { isStaffAppHost } from "@/lib/tenancy/staff-app-origin";

export interface HelpFeedbackActionState {
  status: "idle" | "success" | "error";
  error?: string;
  fieldErrors?: HelpFeedbackFieldErrors;
  category?: HelpFeedbackCategory;
}

export const initialHelpFeedbackActionState: HelpFeedbackActionState = {
  status: "idle",
};

function isNextControlFlow(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    (error.digest.startsWith("NEXT_REDIRECT") ||
      error.digest.startsWith("NEXT_NOT_FOUND"))
  );
}

/**
 * Authenticated clinic help and feedback.
 * Login WAF and the public Contact observation rule do not cover this
 * action. There is no durable application rate limiter to reuse, and an
 * in-memory throttle would not hold on Vercel.
 */
export async function submitHelpFeedbackAction(
  _previous: HelpFeedbackActionState,
  formData: FormData
): Promise<HelpFeedbackActionState> {
  const host = (await headers()).get("host");
  if (!isStaffAppHost(host)) {
    notFound();
  }

  const session = await requireStaffSession();
  const parsed = helpFeedbackSchema.safeParse(readHelpFeedbackForm(formData));
  if (!parsed.success) {
    return {
      status: "error",
      error: HELP_FEEDBACK_REVIEW_FIELDS,
      fieldErrors: helpFeedbackFieldErrors(parsed.error),
    };
  }

  try {
    const result = await deliverHelpFeedback({
      submission: parsed.data,
      clinic: {
        id: session.clinicMembership.clinic.id,
        name: session.clinicMembership.clinic.name,
      },
      user: {
        name: session.user.name,
        email: session.user.email,
      },
    });

    if (!result.ok) {
      return {
        status: "error",
        error: HELP_FEEDBACK_DELIVERY_FAILED,
        category: parsed.data.category,
      };
    }

    return {
      status: "success",
      category: parsed.data.category,
    };
  } catch (error) {
    if (isNextControlFlow(error)) {
      throw error;
    }
    logHelpFeedbackFailure({
      event: "help_feedback_delivery_failed",
      clinicId: session.clinicMembership.clinic.id,
      category: parsed.data.category,
      failureCode: "delivery_failed",
    });
    reportSupportEmailFailure("delivery_failed");
    return {
      status: "error",
      error: HELP_FEEDBACK_DELIVERY_FAILED,
      category: parsed.data.category,
    };
  }
}
