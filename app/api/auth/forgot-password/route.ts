import { NextResponse } from "next/server";

import { AccountTokenError } from "@/lib/auth/account-token-service";
import { LOGIN_EMAIL_MAX_LENGTH } from "@/lib/auth/login-input";
import { FORGOT_PASSWORD_GENERIC_MESSAGE } from "@/lib/auth/password-policy";
import { requestPasswordReset } from "@/lib/auth/request-password-reset";
import { parseEmailAddress } from "@/lib/email/mailbox";
import { isTrustedStaffAuthMutationRequest } from "@/lib/tenancy/staff-app-origin";

function genericSuccess() {
  return NextResponse.json({ message: FORGOT_PASSWORD_GENERIC_MESSAGE });
}

export async function POST(request: Request) {
  if (!isTrustedStaffAuthMutationRequest(request)) {
    return new NextResponse(null, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 }
    );
  }

  const emailInput =
    typeof (body as { email?: unknown })?.email === "string"
      ? (body as { email: string }).email
      : "";
  const normalized = emailInput.trim().toLowerCase();

  if (!normalized) {
    return NextResponse.json(
      {
        error: "Enter your email address.",
        fieldErrors: { email: "Enter your email address." },
      },
      { status: 400 }
    );
  }

  if (normalized.length > LOGIN_EMAIL_MAX_LENGTH) {
    return NextResponse.json(
      {
        error: "Email address is too long.",
        fieldErrors: { email: "Email address is too long." },
      },
      { status: 400 }
    );
  }

  if (!parseEmailAddress(normalized)) {
    return NextResponse.json(
      {
        error: "Enter a valid email address.",
        fieldErrors: { email: "Enter a valid email address." },
      },
      { status: 400 }
    );
  }

  try {
    await requestPasswordReset({ email: normalized });
  } catch (error) {
    if (!(error instanceof AccountTokenError)) {
      return genericSuccess();
    }
  }

  return genericSuccess();
}
