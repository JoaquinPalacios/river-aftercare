import { NextResponse } from "next/server";

import {
  REGISTRATION_INTENT_INVALID_LINK_MESSAGE,
  REGISTRATION_VERIFY_CONFIRMED_MESSAGE,
  REGISTRATION_VERIFY_EXPIRED_MESSAGE,
} from "@/lib/auth/registration-copy";
import { registrationAccessDenial } from "@/lib/auth/registration-http";
import { validateRegistrationIntent } from "@/lib/auth/registration-intent-service";

/**
 * Confirms a verification token without consuming it. Clinic provisioning is
 * a later phase and must consume the intent in the same transaction.
 */
export async function POST(request: Request) {
  const denied = registrationAccessDenial(request);
  if (denied) {
    return denied;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        status: "invalid",
        message: REGISTRATION_INTENT_INVALID_LINK_MESSAGE,
      },
      { status: 400 }
    );
  }

  const rawToken =
    typeof (body as { token?: unknown })?.token === "string"
      ? (body as { token: string }).token
      : "";

  try {
    const result = await validateRegistrationIntent({ rawToken });
    if (!result.ok) {
      if (result.reason === "expired") {
        return NextResponse.json({
          status: "expired",
          message: REGISTRATION_VERIFY_EXPIRED_MESSAGE,
        });
      }
      return NextResponse.json({
        status: "invalid",
        message: REGISTRATION_INTENT_INVALID_LINK_MESSAGE,
      });
    }
  } catch {
    return NextResponse.json({
      status: "invalid",
      message: REGISTRATION_INTENT_INVALID_LINK_MESSAGE,
    });
  }

  return NextResponse.json({
    status: "valid",
    message: REGISTRATION_VERIFY_CONFIRMED_MESSAGE,
  });
}
