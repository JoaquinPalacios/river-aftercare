import "server-only";

import { billingNoticeIdempotencyKey } from "@/lib/billing/notices/evaluate";
import type { BillingNoticeStore } from "@/lib/billing/notices/store";
import type { PlannedBillingEmail } from "@/lib/billing/notices/types";
import { getBillingNoticeMailConfig } from "@/lib/email/billing-notice-mail";
import {
  sendTransactionalEmail,
  type TransactionalEmailSendResult,
} from "@/lib/email/transactional-mailer";
import {
  OPERATIONAL_FAILURE_CODES,
  reportOperationalFailure,
} from "@/lib/observability/report-server-exception";

export type BillingNoticeSender = (input: {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
  replyTo: string;
}) => Promise<TransactionalEmailSendResult>;

export type BillingNoticeDeliveryCounts = {
  examined: number;
  sent: number;
  failed: number;
  skipped: number;
};

export function logBillingNotice(entry: {
  event:
    | "billing_notice_delivery_failed"
    | "billing_notice_not_configured"
    | "billing_price_change_ambiguous";
  clinicId: string;
  kind?: PlannedBillingEmail["kind"];
  failureCode?: string;
}): void {
  console.error(JSON.stringify(entry));
}

export function createConfiguredBillingNoticeSender(
  env: Record<string, string | undefined> = process.env
): BillingNoticeSender | null {
  const config = getBillingNoticeMailConfig(env);
  if (!config.ready) {
    return null;
  }
  return async (input) =>
    sendTransactionalEmail(
      {
        from: config.from,
        to: input.to,
        replyTo: input.replyTo || config.replyTo,
        subject: input.subject,
        text: input.text,
        html: input.html,
      },
      config.transport,
      { idempotencyKey: input.idempotencyKey }
    );
}

export async function deliverPlannedBillingEmails(input: {
  clinicId: string;
  stripeSubscriptionId: string;
  billingEmail: string | null;
  emails: readonly PlannedBillingEmail[];
  now: Date;
  store: BillingNoticeStore;
  sender: BillingNoticeSender | null;
  replyTo?: string;
}): Promise<Pick<BillingNoticeDeliveryCounts, "sent" | "failed" | "skipped">> {
  const counts = { sent: 0, failed: 0, skipped: 0 };
  let reportedConfig = false;
  for (const email of input.emails) {
    const claim = {
      clinicId: input.clinicId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      kind: email.kind,
      eventKey: email.eventKey,
      now: input.now,
    };
    const decision = await input.store.claim(claim);
    if (decision === "skip") {
      counts.skipped += 1;
      continue;
    }

    const recipient = input.billingEmail?.trim() ?? "";
    if (!recipient || !input.sender) {
      const failureCode = !input.sender
        ? "not_configured"
        : "missing_recipient";
      await input.store.complete({
        ...claim,
        result: { ok: false, failureCode },
      });
      logBillingNotice({
        event:
          failureCode === "not_configured"
            ? "billing_notice_not_configured"
            : "billing_notice_delivery_failed",
        clinicId: input.clinicId,
        kind: email.kind,
        failureCode,
      });
      if (failureCode === "not_configured" && !reportedConfig) {
        reportedConfig = true;
        reportOperationalFailure(
          OPERATIONAL_FAILURE_CODES.BILLING_NOTICE_NOT_CONFIGURED,
          { component: "billing-notice", failure_code: "not_configured" }
        );
      } else if (failureCode !== "not_configured") {
        reportOperationalFailure(
          OPERATIONAL_FAILURE_CODES.BILLING_NOTICE_DELIVERY_FAILED,
          { component: "billing-notice", failure_code: "delivery_failed" }
        );
      }
      counts.failed += 1;
      continue;
    }

    const result = await input.sender({
      to: recipient,
      subject: email.subject,
      text: email.text,
      html: email.html,
      replyTo: input.replyTo ?? "",
      idempotencyKey: billingNoticeIdempotencyKey({
        clinicId: input.clinicId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        kind: email.kind,
        eventKey: email.eventKey,
      }),
    });
    if (result.ok) {
      await input.store.complete({ ...claim, result: { ok: true } });
      counts.sent += 1;
      continue;
    }
    await input.store.complete({
      ...claim,
      result: { ok: false, failureCode: result.code },
    });
    logBillingNotice({
      event: "billing_notice_delivery_failed",
      clinicId: input.clinicId,
      kind: email.kind,
      failureCode: result.code,
    });
    reportOperationalFailure(
      result.code === "not_configured"
        ? OPERATIONAL_FAILURE_CODES.BILLING_NOTICE_NOT_CONFIGURED
        : OPERATIONAL_FAILURE_CODES.BILLING_NOTICE_DELIVERY_FAILED,
      {
        component: "billing-notice",
        failure_code:
          result.code === "not_configured"
            ? "not_configured"
            : "delivery_failed",
      }
    );
    counts.failed += 1;
  }
  return counts;
}
