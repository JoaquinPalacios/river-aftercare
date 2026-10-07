import "server-only";

import { getAuthEmailDeliveryConfig } from "@/lib/email/auth-email";
import { parseEmailAddress } from "@/lib/email/mailbox";
import {
  sendTransactionalEmail,
  type TransactionalEmailMessage,
  type TransactionalEmailTransport,
} from "@/lib/email/transactional-mailer";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { reportSupportEmailFailure } from "@/lib/observability/report-server-exception";
import {
  HELP_FEEDBACK_IMPORTANCE_LABELS,
  helpFeedbackEnvironmentLabel,
  helpFeedbackSubject,
  sanitizeHelpHeaderValue,
  type HelpFeedbackCategory,
  type HelpFeedbackSubmission,
} from "@/lib/support/help-feedback-fields";

export const RIVER_AFTERCARE_SUPPORT_EMAIL_ENV =
  "RIVER_AFTERCARE_SUPPORT_EMAIL";

export type HelpFeedbackFailureLog = {
  event: "help_feedback_delivery_failed" | "help_feedback_not_configured";
  clinicId: string;
  category: HelpFeedbackCategory;
  failureCode: "not_configured" | "delivery_failed" | "invalid_message";
};

type Env = Record<string, string | undefined>;

export type SupportFeedbackDeliveryConfig =
  | {
      ready: true;
      to: string;
      from: string;
      transport: TransactionalEmailTransport;
    }
  | {
      ready: false;
      reason: "missing_recipient" | "missing_from" | "missing_api_key";
    };

const memoryInbox: TransactionalEmailMessage[] = [];

export function getHelpFeedbackMemoryInbox(): readonly TransactionalEmailMessage[] {
  return memoryInbox;
}

export function clearHelpFeedbackMemoryInbox(): void {
  memoryInbox.length = 0;
}

export function logHelpFeedbackFailure(entry: HelpFeedbackFailureLog): void {
  console.error(entry);
}

export function getSupportFeedbackDeliveryConfig(
  env: Env = process.env
): SupportFeedbackDeliveryConfig {
  const to = parseEmailAddress(env[RIVER_AFTERCARE_SUPPORT_EMAIL_ENV]);
  if (!to) {
    return { ready: false, reason: "missing_recipient" };
  }

  const auth = getAuthEmailDeliveryConfig(env);
  if (!auth.ready) {
    return {
      ready: false,
      reason:
        auth.reason === "missing_api_key" ? "missing_api_key" : "missing_from",
    };
  }

  const transport: TransactionalEmailTransport =
    auth.transport.kind === "memory"
      ? { kind: "memory", inbox: memoryInbox }
      : auth.transport;

  return {
    ready: true,
    to,
    from: auth.from,
    transport,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function singleLine(value: string): string {
  const safe = sanitizeHelpHeaderValue(value);
  return safe || "Not provided";
}

function messageText(value: string): string {
  return value
    .replace(/[\u0000\u000b\u000c\u0085\u2028\u2029]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[\u0001-\u0008\u000e-\u001f\u007f]/g, "");
}

export function composeHelpFeedbackMessage({
  submission,
  clinic,
  user,
  toEmail,
  fromEmail,
  submittedAt,
  environment,
}: {
  submission: HelpFeedbackSubmission;
  clinic: { id: string; name: string };
  user: { name: string | null; email: string };
  toEmail: string;
  fromEmail: string;
  submittedAt: Date;
  environment: string;
}): TransactionalEmailMessage {
  const categoryLabel =
    submission.category === "feature"
      ? "Feature request"
      : submission.category === "problem"
        ? "Problem"
        : "Question";
  const rows: Array<[string, string]> = [
    ["Category", categoryLabel],
    ["Clinic", singleLine(clinic.name)],
    ["Account", singleLine(clinic.id)],
    ["Name", singleLine(user.name ?? "")],
    ["Email", singleLine(user.email)],
    ["Page", submission.originPath ?? "Not provided"],
    ["Submitted", submittedAt.toISOString()],
    ["Environment", singleLine(environment)],
  ];

  const detail: Array<[string, string]> = [];
  if (submission.category === "feature") {
    rows.push([
      "Importance",
      submission.importance
        ? HELP_FEEDBACK_IMPORTANCE_LABELS[submission.importance]
        : "Not specified",
    ]);
    detail.push(
      [
        "What would you like River Aftercare to help you do?",
        messageText(submission.goal),
      ],
      [
        "What problem would this solve for your clinic?",
        messageText(submission.problem),
      ]
    );
  } else {
    detail.push(
      ["Summary", messageText(submission.summary)],
      ["Message", messageText(submission.message)]
    );
  }

  const text = [
    `${PRODUCT_NAME} help and feedback`,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    ...detail.flatMap(([label, value]) => [label, value, ""]),
  ]
    .join("\n")
    .trimEnd();

  const html = [
    `<p>${escapeHtml(PRODUCT_NAME)} help and feedback</p>`,
    "<table>",
    ...rows.map(
      ([label, value]) =>
        `<tr><th align="left">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`
    ),
    "</table>",
    ...detail.map(
      ([label, value]) =>
        `<p><strong>${escapeHtml(label)}</strong></p><p>${escapeHtml(value).replaceAll("\n", "<br />")}</p>`
    ),
  ].join("");

  const replyTo = parseEmailAddress(user.email) ?? undefined;

  return {
    to: toEmail,
    from: fromEmail,
    replyTo,
    subject: helpFeedbackSubject(submission),
    text,
    html,
  };
}

export async function deliverHelpFeedback(
  input: {
    submission: HelpFeedbackSubmission;
    clinic: { id: string; name: string };
    user: { name: string | null; email: string };
    submittedAt?: Date;
  },
  env: Env = process.env
): Promise<{ ok: true } | { ok: false }> {
  const config = getSupportFeedbackDeliveryConfig(env);
  if (!config.ready) {
    logHelpFeedbackFailure({
      event: "help_feedback_not_configured",
      clinicId: input.clinic.id,
      category: input.submission.category,
      failureCode: "not_configured",
    });
    reportSupportEmailFailure("not_configured");
    return { ok: false };
  }

  const message = composeHelpFeedbackMessage({
    submission: input.submission,
    clinic: input.clinic,
    user: input.user,
    toEmail: config.to,
    fromEmail: config.from,
    submittedAt: input.submittedAt ?? new Date(),
    environment: helpFeedbackEnvironmentLabel(env),
  });

  const result = await sendTransactionalEmail(message, config.transport);
  if (!result.ok) {
    const failureCode =
      result.code === "not_configured" || result.code === "invalid_message"
        ? result.code
        : "delivery_failed";
    logHelpFeedbackFailure({
      event: "help_feedback_delivery_failed",
      clinicId: input.clinic.id,
      category: input.submission.category,
      failureCode,
    });
    reportSupportEmailFailure(failureCode);
    return { ok: false };
  }

  return { ok: true };
}
