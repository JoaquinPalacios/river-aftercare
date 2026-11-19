import "server-only";

import { NextResponse } from "next/server";

import { isRegistrationEnabled } from "@/lib/auth/registration-flag";
import {
  REGISTRATION_INTENT_GENERIC_MESSAGE,
  REGISTRATION_VERIFICATION_FAILED_MESSAGE,
} from "@/lib/auth/registration-copy";
import type { RegistrationTurnstileAction } from "@/lib/auth/registration-turnstile";
import { CONTACT_HONEYPOT_FIELD } from "@/lib/marketing/contact-fields";
import { readTurnstileToken } from "@/lib/marketing/contact-turnstile-public";
import {
  getTurnstileSecretKey,
  vercelRequestIp,
  verifyTurnstileToken,
} from "@/lib/marketing/contact-turnstile";
import { isTrustedStaffAuthMutationRequest } from "@/lib/tenancy/staff-app-origin";
import { getRootDomain } from "@/lib/tenancy/root-domain";

export function registrationUnavailable(): NextResponse {
  return new NextResponse(null, { status: 404 });
}

export function registrationGenericSuccess(): NextResponse {
  return NextResponse.json({ message: REGISTRATION_INTENT_GENERIC_MESSAGE });
}

/**
 * Staff host, Origin, and the registration flag. A null return means the
 * mutation may continue.
 */
export function registrationAccessDenial(
  request: Request
): NextResponse | null {
  if (!isRegistrationEnabled()) {
    return registrationUnavailable();
  }
  if (!isTrustedStaffAuthMutationRequest(request)) {
    return registrationUnavailable();
  }
  return null;
}

export function registrationHoneypotTripped(formData: FormData): boolean {
  const value = formData.get(CONTACT_HONEYPOT_FIELD);
  return typeof value === "string" && value.trim().length > 0;
}

export function registrationTurnstileHostname(
  env: NodeJS.ProcessEnv = process.env
): string {
  return `app.${getRootDomain(env)}`;
}

export async function registrationTurnstileDenial(
  request: Request,
  formData: FormData,
  action: RegistrationTurnstileAction
): Promise<NextResponse | null> {
  return registrationTurnstileTokenDenial(
    request,
    readTurnstileToken(formData),
    action
  );
}

export async function registrationTurnstileTokenDenial(
  request: Request,
  token: string,
  action: RegistrationTurnstileAction
): Promise<NextResponse | null> {
  const verification = await verifyTurnstileToken({
    token,
    secret: getTurnstileSecretKey(),
    remoteIp: vercelRequestIp(request.headers),
    expectedHostname: registrationTurnstileHostname(),
    expectedAction: action,
  });
  if (verification.ok) {
    return null;
  }
  return NextResponse.json(
    { error: REGISTRATION_VERIFICATION_FAILED_MESSAGE },
    { status: 400 }
  );
}

export function readFormText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
