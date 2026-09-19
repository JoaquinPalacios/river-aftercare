import { PASSWORD_RESET_URL_TOKEN_KEY } from "@/lib/auth/account-token-format";
import { parseHostname } from "@/lib/tenancy/parse-hostname";
import { getRootDomain } from "@/lib/tenancy/root-domain";

export const PASSWORD_RESET_PAGE_PATH = "/reset-password";

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

export function buildPasswordResetUrl(
  rawToken: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  return `${staffAppOrigin(env)}${PASSWORD_RESET_PAGE_PATH}#${PASSWORD_RESET_URL_TOKEN_KEY}=${encodeURIComponent(rawToken)}`;
}
