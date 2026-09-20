import "server-only";

import {
  getMarketingContactDeliveryConfig,
  type MarketingContactDeliveryConfig,
} from "@/lib/marketing/contact-config";
import { composeMarketingContactMessage } from "@/lib/marketing/contact-mail";
import type { ContactEnquiry } from "@/lib/marketing/contact-enquiry";
import {
  sendTransactionalEmail,
  type TransactionalEmailMessage,
} from "@/lib/email/transactional-mailer";
import { reportContactEmailFailure } from "@/lib/observability/report-server-exception";

export const CONTACT_DELIVERY_FAILED =
  "We couldn't send your message right now. Please try again.";

export type MarketingContactMailerResult =
  { ok: true } | { ok: false; error: string };

const memoryInbox: TransactionalEmailMessage[] = [];

export function getMarketingContactMemoryInbox(): readonly TransactionalEmailMessage[] {
  return memoryInbox;
}

export function clearMarketingContactMemoryInbox(): void {
  memoryInbox.length = 0;
}

export async function deliverMarketingContactEnquiry(
  enquiry: ContactEnquiry,
  config: MarketingContactDeliveryConfig = getMarketingContactDeliveryConfig()
): Promise<MarketingContactMailerResult> {
  if (!config.ready) {
    reportContactEmailFailure("not_configured");
    return { ok: false, error: CONTACT_DELIVERY_FAILED };
  }

  const message = composeMarketingContactMessage({
    enquiry,
    toEmail: config.toEmail,
    fromEmail: config.fromEmail,
  });

  const result = await sendTransactionalEmail(
    message,
    config.kind === "memory"
      ? { kind: "memory", inbox: memoryInbox }
      : { kind: "resend", apiKey: config.apiKey }
  );

  if (!result.ok) {
    reportContactEmailFailure(
      result.code === "not_configured" || result.code === "invalid_message"
        ? result.code
        : "delivery_failed"
    );
    return { ok: false, error: CONTACT_DELIVERY_FAILED };
  }

  return { ok: true };
}
