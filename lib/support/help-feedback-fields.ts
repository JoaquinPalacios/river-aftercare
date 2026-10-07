export const HELP_FEEDBACK_CATEGORIES = [
  "problem",
  "question",
  "feature",
] as const;

export type HelpFeedbackCategory = (typeof HELP_FEEDBACK_CATEGORIES)[number];

export const HELP_FEEDBACK_IMPORTANCE = [
  "nice_to_have",
  "important",
  "very_important",
] as const;

export type HelpFeedbackImportance = (typeof HELP_FEEDBACK_IMPORTANCE)[number];

export const HELP_FEEDBACK_IMPORTANCE_LABELS: Record<
  HelpFeedbackImportance,
  string
> = {
  nice_to_have: "Nice to have",
  important: "Important",
  very_important: "Very important",
};

export const HELP_FEEDBACK_LIMITS = {
  summary: 140,
  message: 4000,
  originPath: 200,
} as const;

export const HELP_FEEDBACK_PATIENT_WARNING =
  "Please do not include patient names, medical information, photos, or other patient-identifiable information in this message.";

export const HELP_FEEDBACK_SENT_MESSAGE =
  "Thanks — your message has been sent to the River Aftercare team.";

export const HELP_FEEDBACK_FEATURE_ACKNOWLEDGEMENT =
  "Thanks — we review feature requests when planning improvements to River Aftercare.";

export const HELP_FEEDBACK_DELIVERY_FAILED =
  "We couldn't send your message right now. Please try again.";

export const HELP_FEEDBACK_REVIEW_FIELDS =
  "Please review the highlighted fields.";

export type HelpFeedbackField =
  "category" | "summary" | "message" | "goal" | "problem" | "importance";

export type HelpFeedbackFieldErrors = Partial<
  Record<HelpFeedbackField, string>
>;

export type HelpFeedbackSubmission =
  | {
      category: "problem" | "question";
      summary: string;
      message: string;
      originPath: string | null;
    }
  | {
      category: "feature";
      goal: string;
      problem: string;
      importance: HelpFeedbackImportance | null;
      originPath: string | null;
    };

const ORIGIN_PATH_PATTERN = /^\/[A-Za-z0-9._~/-]*$/;

export function sanitizeHelpHeaderValue(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeHelpOriginPath(
  value: string | null | undefined
): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.length > HELP_FEEDBACK_LIMITS.originPath ||
    trimmed.includes("\\") ||
    trimmed.includes("..") ||
    trimmed.includes("//") ||
    trimmed.includes("?") ||
    trimmed.includes("#") ||
    trimmed.includes("@") ||
    /[\u0000-\u001f\u007f]/.test(trimmed) ||
    !ORIGIN_PATH_PATTERN.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

export function helpFeedbackSubject(
  submission: HelpFeedbackSubmission
): string {
  if (submission.category === "feature") {
    const summary = sanitizeHelpHeaderValue(submission.goal);
    return summary
      ? `[River Aftercare Feedback] Feature request — ${summary}`
      : "[River Aftercare Feedback] Feature request";
  }

  const label = submission.category === "problem" ? "Problem" : "Question";
  const summary = sanitizeHelpHeaderValue(submission.summary);
  return summary
    ? `[River Aftercare Support] ${label} — ${summary}`
    : `[River Aftercare Support] ${label}`;
}

export function helpFeedbackEnvironmentLabel(
  env: Record<string, string | undefined>
): string {
  const vercel = env.VERCEL_ENV?.trim();
  if (
    vercel === "production" ||
    vercel === "preview" ||
    vercel === "development"
  ) {
    return vercel;
  }
  if (
    env.NODE_ENV === "production" ||
    env.NODE_ENV === "development" ||
    env.NODE_ENV === "test"
  ) {
    return env.NODE_ENV;
  }
  return "unknown";
}

export function isHelpFeedbackCategory(
  value: string
): value is HelpFeedbackCategory {
  return (HELP_FEEDBACK_CATEGORIES as readonly string[]).includes(value);
}

export function isHelpFeedbackImportance(
  value: string
): value is HelpFeedbackImportance {
  return (HELP_FEEDBACK_IMPORTANCE as readonly string[]).includes(value);
}

export const HELP_FEEDBACK_MESSAGES = {
  category: "Choose what you need help with.",
  summary: "Enter a short summary.",
  message: "Enter a message.",
  goal: "Describe what you would like River Aftercare to help you do.",
  problem: "Describe the problem this would solve for your clinic.",
  importance: "Choose an importance, or leave it blank.",
  tooLong: "This value is too long.",
} as const;

export interface HelpFeedbackFormInput {
  category: string;
  summary: string;
  message: string;
  goal: string;
  problem: string;
  importance: string;
  originPath: string;
}

function tooLong(value: string, max: number): boolean {
  return value.trim().length > max;
}

export function helpFeedbackClientFieldErrors(
  values: HelpFeedbackFormInput
): HelpFeedbackFieldErrors {
  const errors: HelpFeedbackFieldErrors = {};
  if (!isHelpFeedbackCategory(values.category)) {
    errors.category = HELP_FEEDBACK_MESSAGES.category;
    return errors;
  }

  if (values.category === "feature") {
    if (tooLong(values.goal, HELP_FEEDBACK_LIMITS.summary)) {
      errors.goal = HELP_FEEDBACK_MESSAGES.tooLong;
    } else if (!sanitizeHelpHeaderValue(values.goal)) {
      errors.goal = HELP_FEEDBACK_MESSAGES.goal;
    }
    if (tooLong(values.problem, HELP_FEEDBACK_LIMITS.message)) {
      errors.problem = HELP_FEEDBACK_MESSAGES.tooLong;
    } else if (!values.problem.trim()) {
      errors.problem = HELP_FEEDBACK_MESSAGES.problem;
    }
    if (
      values.importance.trim() &&
      !isHelpFeedbackImportance(values.importance.trim())
    ) {
      errors.importance = HELP_FEEDBACK_MESSAGES.importance;
    }
    return errors;
  }

  if (tooLong(values.summary, HELP_FEEDBACK_LIMITS.summary)) {
    errors.summary = HELP_FEEDBACK_MESSAGES.tooLong;
  } else if (!sanitizeHelpHeaderValue(values.summary)) {
    errors.summary = HELP_FEEDBACK_MESSAGES.summary;
  }
  if (tooLong(values.message, HELP_FEEDBACK_LIMITS.message)) {
    errors.message = HELP_FEEDBACK_MESSAGES.tooLong;
  } else if (!values.message.trim()) {
    errors.message = HELP_FEEDBACK_MESSAGES.message;
  }
  return errors;
}

export function readHelpFeedbackForm(
  formData: FormData
): HelpFeedbackFormInput {
  const read = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };

  return {
    category: read("category"),
    summary: read("summary"),
    message: read("message"),
    goal: read("goal"),
    problem: read("problem"),
    importance: read("importance"),
    originPath: read("originPath"),
  };
}
