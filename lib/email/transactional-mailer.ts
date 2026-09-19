import "server-only";

import { Resend } from "resend";

import { parseEmailAddress, parseMailboxAddress } from "@/lib/email/mailbox";

export const RESEND_SEND_TIMEOUT_MS = 8000;

export type TransactionalEmailMessage = {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
};

export type TransactionalEmailTransport =
  | { kind: "memory"; inbox?: TransactionalEmailMessage[] }
  | { kind: "resend"; apiKey: string };

export type TransactionalEmailSendResult =
  | { ok: true }
  | {
      ok: false;
      code: "invalid_message" | "not_configured" | "delivery_failed";
    };

const defaultMemoryInbox: TransactionalEmailMessage[] = [];

export function getTransactionalEmailMemoryInbox(): readonly TransactionalEmailMessage[] {
  return defaultMemoryInbox;
}

export function clearTransactionalEmailMemoryInbox(): void {
  defaultMemoryInbox.length = 0;
}

function sanitizeHeader(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || /[\r\n]/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function validatedMessage(
  message: TransactionalEmailMessage
): TransactionalEmailMessage | null {
  const from = parseMailboxAddress(message.from);
  const to = parseEmailAddress(message.to);
  const subject = sanitizeHeader(message.subject);
  const text = typeof message.text === "string" ? message.text : "";
  const html = typeof message.html === "string" ? message.html : "";
  const replyTo = message.replyTo
    ? parseMailboxAddress(message.replyTo)
    : undefined;

  if (!from || !to || !subject || !text || !html) {
    return null;
  }
  if (message.replyTo && !replyTo) {
    return null;
  }

  return {
    from,
    to,
    replyTo: replyTo ?? undefined,
    subject,
    text,
    html,
  };
}

async function sendWithResend({
  apiKey,
  message,
}: {
  apiKey: string;
  message: TransactionalEmailMessage;
}): Promise<TransactionalEmailSendResult> {
  if (!apiKey) {
    return { ok: false, code: "not_configured" };
  }

  const resend = new Resend(apiKey);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const payload: {
      from: string;
      to: string[];
      replyTo?: string;
      subject: string;
      text: string;
      html: string;
    } = {
      from: message.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    };
    if (message.replyTo) {
      payload.replyTo = message.replyTo;
    }

    const timed = await Promise.race([
      resend.emails.send(payload),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error("timeout"));
        }, RESEND_SEND_TIMEOUT_MS);
      }),
    ]);

    if (timed.error) {
      return { ok: false, code: "delivery_failed" };
    }

    return { ok: true };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function sendTransactionalEmail(
  message: TransactionalEmailMessage,
  transport: TransactionalEmailTransport
): Promise<TransactionalEmailSendResult> {
  const safeMessage = validatedMessage(message);
  if (!safeMessage) {
    return { ok: false, code: "invalid_message" };
  }

  if (transport.kind === "memory") {
    const inbox = transport.inbox ?? defaultMemoryInbox;
    inbox.push({ ...safeMessage });
    return { ok: true };
  }

  if (!transport.apiKey) {
    return { ok: false, code: "not_configured" };
  }

  try {
    return await sendWithResend({
      apiKey: transport.apiKey,
      message: safeMessage,
    });
  } catch {
    return { ok: false, code: "delivery_failed" };
  }
}
