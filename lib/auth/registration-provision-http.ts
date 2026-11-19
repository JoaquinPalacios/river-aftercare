import "server-only";

import { NextResponse } from "next/server";

import {
  REGISTRATION_INTENT_INVALID_LINK_MESSAGE,
  REGISTRATION_PROVISION_RETRY_MESSAGE,
  REGISTRATION_SIGN_IN_MESSAGE,
  REGISTRATION_VERIFY_EXPIRED_MESSAGE,
} from "@/lib/auth/registration-copy";
import type { RegistrationProvisionOutcome } from "@/lib/auth/provision-registration-clinic";
import {
  AUTH_SESSION_COOKIE_NAME,
  authSessionCookieOptions,
} from "@/lib/auth/session-cookie";

/**
 * Browser-facing result of provisioning. The session token is only the
 * HttpOnly cookie. The body never includes the verification token, password,
 * or email.
 */
export function registrationProvisionHttpResponse(
  outcome: RegistrationProvisionOutcome
): NextResponse {
  if (outcome.status === "provisioned") {
    const response = NextResponse.json({
      status: "provisioned",
      redirectTo: outcome.redirectTo,
    });
    response.cookies.set({
      ...authSessionCookieOptions,
      name: AUTH_SESSION_COOKIE_NAME,
      value: outcome.session.sessionToken,
      expires: outcome.session.expires,
    });
    return response;
  }

  if (outcome.status === "slug_unavailable") {
    return NextResponse.json({
      status: "slug_unavailable",
      message: outcome.message,
      slug: outcome.slug,
    });
  }

  if (outcome.status === "sign_in") {
    return NextResponse.json({
      status: "sign_in",
      message: REGISTRATION_SIGN_IN_MESSAGE,
    });
  }

  if (outcome.status === "expired") {
    return NextResponse.json({
      status: "expired",
      message: REGISTRATION_VERIFY_EXPIRED_MESSAGE,
    });
  }

  if (outcome.status === "retry") {
    return NextResponse.json(
      {
        status: "retry",
        message: REGISTRATION_PROVISION_RETRY_MESSAGE,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    status: "invalid",
    message: REGISTRATION_INTENT_INVALID_LINK_MESSAGE,
  });
}
