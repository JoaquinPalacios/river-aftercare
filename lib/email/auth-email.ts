import "server-only";

import { parseMailboxAddress } from "@/lib/email/mailbox";
import { getResendApiKey } from "@/lib/email/resend-api-key";
import {
  sendTransactionalEmail,
  type TransactionalEmailSendResult,
  type TransactionalEmailTransport,
} from "@/lib/email/transactional-mailer";
import { isVercelProduction } from "@/lib/runtime/vercel-production";

export const AUTH_EMAIL_FROM_ENV = "AUTH_EMAIL_FROM";
export const AUTH_EMAIL_REPLY_TO_ENV = "AUTH_EMAIL_REPLY_TO";
export const AUTH_EMAIL_TRANSPORT_ENV = "AUTH_EMAIL_TRANSPORT";
export const AUTH_EMAIL_TRANSPORT_MAILPIT = "mailpit";

type Env = Record<string, string | undefined>;

export type AuthEmailDeliveryConfig =
  | {
      ready: true;
      from: string;
      replyTo?: string;
      transport: TransactionalEmailTransport;
    }
  | {
      ready: false;
      reason:
        | "missing_from"
        | "malformed_from"
        | "malformed_reply_to"
        | "missing_api_key";
    };

export function getAuthEmailFrom(env: Env = process.env): string | null {
  return parseMailboxAddress(env[AUTH_EMAIL_FROM_ENV]);
}

export function getAuthEmailReplyTo(env: Env = process.env): string | null {
  const raw = env[AUTH_EMAIL_REPLY_TO_ENV];
  if (!raw?.trim()) {
    return null;
  }
  return parseMailboxAddress(raw);
}

function isAnyVercelEnvironment(env: Env): boolean {
  if (env.VERCEL === "1") {
    return true;
  }
  return Boolean(env.VERCEL_ENV?.trim());
}

function localMailpitRequested(env: Env): boolean {
  const requested = env[AUTH_EMAIL_TRANSPORT_ENV]?.trim().toLowerCase();
  if (requested !== AUTH_EMAIL_TRANSPORT_MAILPIT) {
    return false;
  }
  return env.NODE_ENV === "development" && !isAnyVercelEnvironment(env);
}

export function getAuthEmailDeliveryConfig(
  env: Env = process.env
): AuthEmailDeliveryConfig {
  const fromRaw = env[AUTH_EMAIL_FROM_ENV];
  if (!fromRaw?.trim()) {
    return { ready: false, reason: "missing_from" };
  }

  const from = parseMailboxAddress(fromRaw);
  if (!from) {
    return { ready: false, reason: "malformed_from" };
  }

  const replyRaw = env[AUTH_EMAIL_REPLY_TO_ENV];
  let replyTo: string | undefined;
  if (replyRaw?.trim()) {
    const parsedReply = parseMailboxAddress(replyRaw);
    if (!parsedReply) {
      return { ready: false, reason: "malformed_reply_to" };
    }
    replyTo = parsedReply;
  }

  if (isVercelProduction(env)) {
    const apiKey = getResendApiKey(env);
    if (!apiKey) {
      return { ready: false, reason: "missing_api_key" };
    }
    return {
      ready: true,
      from,
      replyTo,
      transport: { kind: "resend", apiKey },
    };
  }

  if (localMailpitRequested(env)) {
    return {
      ready: true,
      from,
      replyTo,
      transport: { kind: "mailpit" },
    };
  }

  return {
    ready: true,
    from,
    replyTo,
    transport: { kind: "memory" },
  };
}

export async function sendAuthTransactionalEmail(
  input: {
    to: string;
    subject: string;
    text: string;
    html: string;
  },
  config: AuthEmailDeliveryConfig = getAuthEmailDeliveryConfig()
): Promise<TransactionalEmailSendResult> {
  if (!config.ready) {
    return { ok: false, code: "not_configured" };
  }

  return sendTransactionalEmail(
    {
      from: config.from,
      to: input.to,
      replyTo: config.replyTo,
      subject: input.subject,
      text: input.text,
      html: input.html,
    },
    config.transport
  );
}
