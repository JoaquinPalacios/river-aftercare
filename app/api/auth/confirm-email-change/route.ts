import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { isWellFormedRawAccountToken } from "@/lib/auth/account-token-format";
import { EMAIL_CHANGE_INVALID_LINK_MESSAGE } from "@/lib/auth/account-profile-schema";
import { completeEmailChangeWithToken } from "@/lib/auth/complete-email-change";
import { isTrustedStaffAuthMutationRequest } from "@/lib/tenancy/staff-app-origin";

function invalidTokenResponse() {
  return NextResponse.json(
    {
      error: EMAIL_CHANGE_INVALID_LINK_MESSAGE,
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

  if (!isWellFormedRawAccountToken(token)) {
    return invalidTokenResponse();
  }

  const result = await completeEmailChangeWithToken({ rawToken: token });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const session = await auth();
  const signedIn = session?.user?.id === result.userId;

  return NextResponse.json({ ok: true, signedIn });
}
