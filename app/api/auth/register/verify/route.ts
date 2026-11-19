import { NextResponse } from "next/server";

import {
  REGISTRATION_INTENT_INVALID_LINK_MESSAGE,
  REGISTRATION_VERIFICATION_FAILED_MESSAGE,
} from "@/lib/auth/registration-copy";
import {
  registrationAccessDenial,
  registrationTurnstileTokenDenial,
} from "@/lib/auth/registration-http";
import { REGISTRATION_TURNSTILE_ACTION } from "@/lib/auth/registration-turnstile";
import { logRegistrationLifecycle } from "@/lib/auth/registration-lifecycle-log";
import { provisionRegisteredClinic } from "@/lib/auth/provision-registration-clinic";
import { registrationProvisionHttpResponse } from "@/lib/auth/registration-provision-http";

/**
 * Consumes a verification token and creates the clinic. The response sets the
 * session cookie and names the billing setup path. It does not call Stripe.
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
  const turnstileToken =
    typeof (body as { turnstileToken?: unknown })?.turnstileToken === "string"
      ? (body as { turnstileToken: string }).turnstileToken
      : "";
  const turnstile = await registrationTurnstileTokenDenial(
    request,
    turnstileToken,
    REGISTRATION_TURNSTILE_ACTION.verify
  );
  if (turnstile) {
    return NextResponse.json(
      {
        status: "verification_failed",
        message: REGISTRATION_VERIFICATION_FAILED_MESSAGE,
      },
      { status: 400 }
    );
  }

  try {
    const outcome = await provisionRegisteredClinic({ rawToken });
    return registrationProvisionHttpResponse(outcome);
  } catch (error) {
    logRegistrationLifecycle({
      event: "registration_clinic_provision_failed",
      name: error instanceof Error ? error.name : "Error",
    });
    return registrationProvisionHttpResponse({ status: "retry" });
  }
}
