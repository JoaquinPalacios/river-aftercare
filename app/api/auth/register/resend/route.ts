import { NextResponse } from "next/server";

import {
  readFormText,
  registrationAccessDenial,
  registrationGenericSuccess,
  registrationHoneypotTripped,
  registrationTurnstileDenial,
} from "@/lib/auth/registration-http";
import { REGISTRATION_TURNSTILE_ACTION } from "@/lib/auth/registration-turnstile";
import { requestRegistrationReplacement } from "@/lib/auth/request-registration";

export async function POST(request: Request) {
  const denied = registrationAccessDenial(request);
  if (denied) {
    return denied;
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 }
    );
  }

  if (registrationHoneypotTripped(formData)) {
    return registrationGenericSuccess();
  }

  const turnstile = await registrationTurnstileDenial(
    request,
    formData,
    REGISTRATION_TURNSTILE_ACTION.resend
  );
  if (turnstile) {
    return turnstile;
  }

  try {
    const result = await requestRegistrationReplacement({
      email: readFormText(formData, "email"),
    });
    if (result.status === "invalid") {
      return NextResponse.json(
        { fieldErrors: { email: result.message } },
        { status: 400 }
      );
    }
  } catch {
    return registrationGenericSuccess();
  }

  return registrationGenericSuccess();
}
