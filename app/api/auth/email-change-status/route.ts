import { NextResponse } from "next/server";

import { getEmailChangeStatus } from "@/lib/auth/complete-email-change";
import { isTrustedStaffAuthMutationRequest } from "@/lib/tenancy/staff-app-origin";

function invalidStatusResponse() {
  return NextResponse.json({ valid: false });
}

export async function POST(request: Request) {
  if (!isTrustedStaffAuthMutationRequest(request)) {
    return new NextResponse(null, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidStatusResponse();
  }

  const token =
    typeof (body as { token?: unknown })?.token === "string"
      ? (body as { token: string }).token
      : "";

  const status = await getEmailChangeStatus({ rawToken: token });
  return NextResponse.json({ valid: status.valid });
}
