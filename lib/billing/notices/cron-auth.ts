import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { parseHostname } from "@/lib/tenancy/parse-hostname";
import { getRootDomain } from "@/lib/tenancy/root-domain";
import { isStaffAppHost } from "@/lib/tenancy/staff-app-origin";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function billingNoticeCronAuthorized(
  authorization: string | null,
  secret: string | undefined
): boolean {
  const expected = secret?.trim() ?? "";
  if (!expected || !authorization?.startsWith("Bearer ")) {
    return false;
  }
  const provided = authorization.slice("Bearer ".length);
  if (!provided || /[\r\n]/.test(provided)) {
    return false;
  }
  return timingSafeEqual(digest(provided), digest(expected));
}

export function billingNoticeCronHostAllowed(
  hostHeader: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (isStaffAppHost(hostHeader, env)) {
    return true;
  }
  try {
    return parseHostname(hostHeader, getRootDomain(env)).kind === "marketing";
  } catch {
    return false;
  }
}
