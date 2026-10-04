import "server-only";

import { Resend } from "resend";

import { parseEmailAddress, parseMailboxAddress } from "@/lib/email/mailbox";

export const RESEND_SEND_TIMEOUT_MS = 8000;

/**
 * Mailpit HTTP send API (`POST /api/v1/send`).
 * Confirmed against Mailpit v1.28 `server/apiv1/swaggerParams.go`:
 * PascalCase `From`, `To`, `ReplyTo` (`Name` + `Email`), `Subject`, `Text`, `HTML`.
 * The address is fixed loopback. It is not configurable.
 */
export const MAILPIT_SEND_URL = "http://127.0.0.1:8025/api/v1/send";
export const MAILPIT_SEND_TIMEOUT_MS = 8000;

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
  | { kind: "resend"; apiKey: string }
  | { kind: "mailpit" };

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
  idempotencyKey,
}: {
  apiKey: string;
  message: TransactionalEmailMessage;
  idempotencyKey?: string;
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
      resend.emails.send(
        payload,
        idempotencyKey ? { idempotencyKey } : undefined
      ),
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

type MailpitAddress = {
  Name: string;
  Email: string;
};

function mailpitAddress(mailbox: string): MailpitAddress {
  const named = mailbox.match(/^(.*)<([^<>]+)>$/);
  if (!named) {
    return { Name: "", Email: mailbox };
  }
  return {
    Name: named[1]?.trim() ?? "",
    Email: named[2]?.trim() ?? mailbox,
  };
}

async function discardMailpitBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Status already decides the result. Do not surface the body.
  }
}

async function sendWithMailpit(
  message: TransactionalEmailMessage
): Promise<TransactionalEmailSendResult> {
  const payload: {
    From: MailpitAddress;
    To: MailpitAddress[];
    ReplyTo?: MailpitAddress[];
    Subject: string;
    Text: string;
    HTML: string;
  } = {
    From: mailpitAddress(message.from),
    To: [mailpitAddress(message.to)],
    Subject: message.subject,
    Text: message.text,
    HTML: message.html,
  };
  if (message.replyTo) {
    payload.ReplyTo = [mailpitAddress(message.replyTo)];
  }

  const response = await fetch(MAILPIT_SEND_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(MAILPIT_SEND_TIMEOUT_MS),
  });
  await discardMailpitBody(response);

  if (!response.ok) {
    return { ok: false, code: "delivery_failed" };
  }

  return { ok: true };
}

export async function sendTransactionalEmail(
  message: TransactionalEmailMessage,
  transport: TransactionalEmailTransport,
  options?: { idempotencyKey?: string }
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

  if (transport.kind === "mailpit") {
    try {
      return await sendWithMailpit(safeMessage);
    } catch {
      return { ok: false, code: "delivery_failed" };
    }
  }

  if (!transport.apiKey) {
    return { ok: false, code: "not_configured" };
  }

  try {
    return await sendWithResend({
      apiKey: transport.apiKey,
      message: safeMessage,
      idempotencyKey: options?.idempotencyKey,
    });
  } catch {
    return { ok: false, code: "delivery_failed" };
  }
}
