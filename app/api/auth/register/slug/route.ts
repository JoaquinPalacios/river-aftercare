import { NextResponse } from "next/server";

import { REGISTRATION_INTENT_INVALID_LINK_MESSAGE } from "@/lib/auth/registration-copy";
import { registrationAccessDenial } from "@/lib/auth/registration-http";
import { logRegistrationLifecycle } from "@/lib/auth/registration-lifecycle-log";
import { recoverAndProvisionRegisteredClinic } from "@/lib/auth/provision-registration-clinic";
import { registrationProvisionHttpResponse } from "@/lib/auth/registration-provision-http";

/**
 * Chooses a replacement tenant slug for a still-live registration, then
 * provisions the clinic. The previous registration stays in place when the
 * new slug is rejected.
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
  const slug =
    typeof (body as { slug?: unknown })?.slug === "string"
      ? (body as { slug: string }).slug
      : "";

  try {
    const outcome = await recoverAndProvisionRegisteredClinic({
      rawToken,
      slug,
    });
    return registrationProvisionHttpResponse(outcome);
  } catch (error) {
    logRegistrationLifecycle({
      event: "registration_clinic_provision_failed",
      name: error instanceof Error ? error.name : "Error",
    });
    return registrationProvisionHttpResponse({ status: "retry" });
  }
}
