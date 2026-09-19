import "server-only";

export const RESEND_API_KEY_ENV = "RESEND_API_KEY";

type Env = Record<string, string | undefined>;

export function getResendApiKey(env: Env = process.env): string | null {
  const key = env[RESEND_API_KEY_ENV]?.trim();
  return key && key.length > 0 ? key : null;
}
