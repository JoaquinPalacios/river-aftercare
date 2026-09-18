import { Resend } from "resend";

import {
  getMarketingContactDeliveryConfig,
  type MarketingContactDeliveryConfig,
} from "@/lib/marketing/contact-config";
import { composeMarketingContactMessage } from "@/lib/marketing/contact-mail";
import type { ContactEnquiry } from "@/lib/marketing/contact-enquiry";
import type { MarketingContactMessage } from "@/lib/marketing/contact-mail";

export const CONTACT_DELIVERY_FAILED =
  "We couldn't send your message right now. Please try again.";

export type MarketingContactMailerResult =
  { ok: true } | { ok: false; error: string };

const memoryInbox: MarketingContactMessage[] = [];

const RESEND_SEND_TIMEOUT_MS = 8000;

export function getMarketingContactMemoryInbox(): readonly MarketingContactMessage[] {
  return memoryInbox;
}

export function clearMarketingContactMemoryInbox(): void {
  memoryInbox.length = 0;
}

async function sendWithResend({
  apiKey,
  message,
}: {
  apiKey: string;
  message: MarketingContactMessage;
}): Promise<MarketingContactMailerResult> {
  const resend = new Resend(apiKey);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timed = await Promise.race([
      resend.emails.send({
        from: message.from,
        to: [message.to],
        replyTo: message.replyTo,
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error("timeout"));
        }, RESEND_SEND_TIMEOUT_MS);
      }),
    ]);

    if (timed.error) {
      return { ok: false, error: CONTACT_DELIVERY_FAILED };
    }

    return { ok: true };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function deliverMarketingContactEnquiry(
  enquiry: ContactEnquiry,
  config: MarketingContactDeliveryConfig = getMarketingContactDeliveryConfig()
): Promise<MarketingContactMailerResult> {
  if (!config.ready) {
    return { ok: false, error: CONTACT_DELIVERY_FAILED };
  }

  const message = composeMarketingContactMessage({
    enquiry,
    toEmail: config.toEmail,
    fromEmail: config.fromEmail,
  });

  if (config.kind === "memory") {
    memoryInbox.push(message);
    return { ok: true };
  }

  try {
    return await sendWithResend({
      apiKey: config.apiKey,
      message,
    });
  } catch {
    return { ok: false, error: CONTACT_DELIVERY_FAILED };
  }
}
