/** Public Turnstile identifiers. Safe to import from Client Components. */

export const CONTACT_TURNSTILE_FIELD = "cf-turnstile-response";

export const CONTACT_TURNSTILE_TOKEN_MAX_LENGTH = 8192;

/** Cloudflare dummy sitekey: managed widget always passes. Public by design. */
export const TURNSTILE_DUMMY_PASS_SITE_KEY = "1x00000000000000000000AA";

export const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export const TURNSTILE_DUMMY_PASS_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

export function readTurnstileToken(formData: FormData): string {
  const value = formData.get(CONTACT_TURNSTILE_FIELD);
  return typeof value === "string" ? value.trim() : "";
}

export function isDummyPassTurnstileSiteKey(siteKey: string): boolean {
  return siteKey === TURNSTILE_DUMMY_PASS_SITE_KEY;
}
