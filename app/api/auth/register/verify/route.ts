import { NextResponse } from "next/server";

import { REGISTRATION_INTENT_INVALID_LINK_MESSAGE } from "@/lib/auth/registration-copy";
import { registrationAccessDenial } from "@/lib/auth/registration-http";
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
