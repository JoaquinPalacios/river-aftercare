import { NextResponse } from "next/server";

import { isWellFormedRawAccountToken } from "@/lib/auth/account-token-format";
import { acceptInvitationWithToken } from "@/lib/auth/accept-invitation";
import { INVITATION_INVALID_LINK_MESSAGE } from "@/lib/auth/password-policy";
import { isTrustedStaffAuthMutationRequest } from "@/lib/tenancy/staff-app-origin";

function invalidTokenResponse() {
  return NextResponse.json(
    {
      error: INVITATION_INVALID_LINK_MESSAGE,
      fieldErrors: { token: INVITATION_INVALID_LINK_MESSAGE },
    },
    { status: 400 }
  );
}

export async function POST(request: Request) {
  if (!isTrustedStaffAuthMutationRequest(request)) {
    return new NextResponse(null, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidTokenResponse();
  }

  const token =
    typeof (body as { token?: unknown })?.token === "string"
      ? (body as { token: string }).token
      : "";
  const newPassword =
    typeof (body as { newPassword?: unknown })?.newPassword === "string"
      ? (body as { newPassword: string }).newPassword
      : "";
  const confirmPassword =
    typeof (body as { confirmPassword?: unknown })?.confirmPassword === "string"
      ? (body as { confirmPassword: string }).confirmPassword
      : "";

  if (!isWellFormedRawAccountToken(token)) {
    return invalidTokenResponse();
  }

  const result = await acceptInvitationWithToken({
    rawToken: token,
    newPassword,
    confirmPassword,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        fieldErrors: result.fieldErrors,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
