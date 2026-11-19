import { REGISTRATION_DISPOSABLE_EMAIL_MESSAGE } from "@/lib/auth/registration-copy";

/**
 * A short, conservative list of temporary inbox domains.
 * Common providers, VPNs, and shared office networks are not on this list.
 */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "10minutemail.com",
  "dispostable.com",
  "fakeinbox.com",
  "getnada.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "maildrop.cc",
  "mailinator.com",
  "mailnesia.com",
  "sharklasers.com",
  "temp-mail.org",
  "tempmail.com",
  "throwawaymail.com",
  "trashmail.com",
  "yopmail.com",
]);

export function disposableRegistrationEmailMessage(
  email: string
): string | null {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (!domain || !DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return null;
  }
  return REGISTRATION_DISPOSABLE_EMAIL_MESSAGE;
}
