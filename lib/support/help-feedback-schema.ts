import { z } from "zod";

import {
  HELP_FEEDBACK_CATEGORIES,
  HELP_FEEDBACK_LIMITS,
  HELP_FEEDBACK_MESSAGES,
  isHelpFeedbackImportance,
  sanitizeHelpHeaderValue,
  sanitizeHelpOriginPath,
  type HelpFeedbackField,
  type HelpFeedbackFieldErrors,
  type HelpFeedbackSubmission,
} from "@/lib/support/help-feedback-fields";

const helpFeedbackObjectSchema = z
  .object({
    category: z.enum(HELP_FEEDBACK_CATEGORIES, {
      error: HELP_FEEDBACK_MESSAGES.category,
    }),
    summary: z
      .string()
      .trim()
      .max(HELP_FEEDBACK_LIMITS.summary, HELP_FEEDBACK_MESSAGES.tooLong),
    message: z
      .string()
      .trim()
      .max(HELP_FEEDBACK_LIMITS.message, HELP_FEEDBACK_MESSAGES.tooLong),
    goal: z
      .string()
      .trim()
      .max(HELP_FEEDBACK_LIMITS.summary, HELP_FEEDBACK_MESSAGES.tooLong),
    problem: z
      .string()
      .trim()
      .max(HELP_FEEDBACK_LIMITS.message, HELP_FEEDBACK_MESSAGES.tooLong),
    importance: z.string().trim(),
    originPath: z.string(),
  })
  .superRefine((value, context) => {
    if (value.category === "feature") {
      if (!sanitizeHelpHeaderValue(value.goal)) {
        context.addIssue({
          code: "custom",
          path: ["goal"],
          message: HELP_FEEDBACK_MESSAGES.goal,
        });
      }
      if (!value.problem.trim()) {
        context.addIssue({
          code: "custom",
          path: ["problem"],
          message: HELP_FEEDBACK_MESSAGES.problem,
        });
      }
      if (value.importance && !isHelpFeedbackImportance(value.importance)) {
        context.addIssue({
          code: "custom",
          path: ["importance"],
          message: HELP_FEEDBACK_MESSAGES.importance,
        });
      }
      return;
    }

    if (!sanitizeHelpHeaderValue(value.summary)) {
      context.addIssue({
        code: "custom",
        path: ["summary"],
        message: HELP_FEEDBACK_MESSAGES.summary,
      });
    }
    if (!value.message.trim()) {
      context.addIssue({
        code: "custom",
        path: ["message"],
        message: HELP_FEEDBACK_MESSAGES.message,
      });
    }
  });

export const helpFeedbackSchema = helpFeedbackObjectSchema.transform(
  (value): HelpFeedbackSubmission => {
    const originPath = sanitizeHelpOriginPath(value.originPath);
    if (value.category === "feature") {
      return {
        category: "feature",
        goal: value.goal,
        problem: value.problem,
        importance: isHelpFeedbackImportance(value.importance)
          ? value.importance
          : null,
        originPath,
      };
    }
    return {
      category: value.category,
      summary: value.summary,
      message: value.message,
      originPath,
    };
  }
);

export function helpFeedbackFieldErrors(
  error: z.ZodError
): HelpFeedbackFieldErrors {
  const fieldErrors: HelpFeedbackFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (isHelpFeedbackField(field) && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }
  return fieldErrors;
}

function isHelpFeedbackField(value: unknown): value is HelpFeedbackField {
  return (
    value === "category" ||
    value === "summary" ||
    value === "message" ||
    value === "goal" ||
    value === "problem" ||
    value === "importance"
  );
}
