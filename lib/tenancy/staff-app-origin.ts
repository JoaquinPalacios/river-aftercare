import { ACCOUNT_TOKEN_URL_KEY } from "@/lib/auth/account-token-format";
import { parseHostname } from "@/lib/tenancy/parse-hostname";
import { getRootDomain } from "@/lib/tenancy/root-domain";

export const PASSWORD_RESET_PAGE_PATH = "/reset-password";
export const ACCEPT_INVITATION_PAGE_PATH = "/accept-invitation";
export const CONFIRM_EMAIL_CHANGE_PAGE_PATH = "/confirm-email-change";

export function staffAppOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const root = getRootDomain(env);
  const protocol =
    root === "localhost" || root.endsWith(".localhost") ? "http" : "https";
  return `${protocol}://app.${root}`;
}

export function isStaffAppHost(
  hostHeader: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  try {
    return parseHostname(hostHeader, getRootDomain(env)).kind === "staff";
  } catch {
    return false;
  }
}

export function isStaffAppOriginHeader(
  originHeader: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (!originHeader) {
    return false;
  }

  try {
    return isStaffAppHost(new URL(originHeader).host, env);
  } catch {
    return false;
  }
}

export function isTrustedStaffAuthMutationRequest(
  request: Request,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (!isStaffAppHost(request.headers.get("host"), env)) {
    return false;
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }

  return isStaffAppOriginHeader(origin, env);
}

function buildStaffFragmentTokenUrl(
  pagePath: string,
  rawToken: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  return `${staffAppOrigin(env)}${pagePath}#${ACCOUNT_TOKEN_URL_KEY}=${encodeURIComponent(rawToken)}`;
}

export function buildPasswordResetUrl(
  rawToken: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  return buildStaffFragmentTokenUrl(PASSWORD_RESET_PAGE_PATH, rawToken, env);
}

export function buildInvitationUrl(
  rawToken: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  return buildStaffFragmentTokenUrl(ACCEPT_INVITATION_PAGE_PATH, rawToken, env);
}

export function buildEmailChangeUrl(
  rawToken: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  return buildStaffFragmentTokenUrl(
    CONFIRM_EMAIL_CHANGE_PAGE_PATH,
    rawToken,
    env
  );
}
