import "server-only";

export const REGISTRATION_ENABLED_ENV = "REGISTRATION_ENABLED";

/**
 * Public registration stays off unless this server environment variable is
 * exactly `true`. A missing value, `false`, or any other string is off.
 * This is not a `NEXT_PUBLIC_` variable.
 */
export function isRegistrationEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env[REGISTRATION_ENABLED_ENV]?.trim().toLowerCase() === "true";
}
