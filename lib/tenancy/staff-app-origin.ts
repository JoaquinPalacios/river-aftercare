import { ACCOUNT_TOKEN_URL_KEY } from "@/lib/auth/account-token-format";
import { parseHostname } from "@/lib/tenancy/parse-hostname";
import { getRootDomain } from "@/lib/tenancy/root-domain";

export const PASSWORD_RESET_PAGE_PATH = "/reset-password";
export const ACCEPT_INVITATION_PAGE_PATH = "/accept-invitation";
export const CONFIRM_EMAIL_CHANGE_PAGE_PATH = "/confirm-email-change";

/** `pnpm dev` listens here. Playwright overrides it via `CARE_GUIDE_METADATA_BASE`. */
const LOCAL_DEVELOPMENT_PORT = "3000";

function isLocalRootDomain(root: string): boolean {
  return root === "localhost" || root.endsWith(".localhost");
}

function isDeployedVercelEnvironment(env: NodeJS.ProcessEnv): boolean {
  return env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview";
}

function configuredLocalDevelopmentPort(env: NodeJS.ProcessEnv): string | null {
  const configured = env.CARE_GUIDE_METADATA_BASE?.trim();
  if (!configured) {
    return null;
  }

  try {
    const origin = new URL(configured);
    const localHost =
      origin.hostname === "localhost" || origin.hostname.endsWith(".localhost");
    if (!localHost || !origin.port) {
      return null;
    }
    return origin.port;
  } catch {
    return null;
  }
}

function staffAppPort(root: string, env: NodeJS.ProcessEnv): string {
  if (!isLocalRootDomain(root) || isDeployedVercelEnvironment(env)) {
    return "";
  }

  return configuredLocalDevelopmentPort(env) ?? LOCAL_DEVELOPMENT_PORT;
}

export function staffAppOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const root = getRootDomain(env);
  const protocol = isLocalRootDomain(root) ? "http" : "https";
  const port = staffAppPort(root, env);
  return `${protocol}://app.${root}${port ? `:${port}` : ""}`;
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
