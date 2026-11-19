/** Cloudflare Turnstile actions for registration. Safe for Client Components. */

export const REGISTRATION_TURNSTILE_ACTION = {
  create: "registration",
  resend: "registration_resend",
  verify: "registration_verify",
  slug: "registration_slug",
} as const;

export type RegistrationTurnstileAction =
  (typeof REGISTRATION_TURNSTILE_ACTION)[keyof typeof REGISTRATION_TURNSTILE_ACTION];
