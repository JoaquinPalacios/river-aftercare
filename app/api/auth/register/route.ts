import { NextResponse } from "next/server";

import { newPasswordFieldErrors } from "@/lib/auth/password-policy";
import { REGISTRATION_TERMS_REQUIRED_MESSAGE } from "@/lib/auth/registration-copy";
import {
  readFormText,
  registrationAccessDenial,
  registrationGenericSuccess,
  registrationHoneypotTripped,
  registrationTurnstileDenial,
} from "@/lib/auth/registration-http";
import { requestRegistrationVerification } from "@/lib/auth/request-registration";

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
      { error: "Check the form and try again." },
      { status: 400 }
    );
  }

  if (registrationHoneypotTripped(formData)) {
    return registrationGenericSuccess();
  }

  const turnstile = await registrationTurnstileDenial(request, formData);
  if (turnstile) {
    return turnstile;
  }

  const password = readFormText(formData, "password");
  const confirmPassword = readFormText(formData, "confirmPassword");
  const passwordErrors = newPasswordFieldErrors(password, confirmPassword);
  if (passwordErrors.newPassword || passwordErrors.confirmPassword) {
    return NextResponse.json(
      {
        fieldErrors: {
          ...(passwordErrors.newPassword
            ? { password: passwordErrors.newPassword }
            : {}),
          ...(passwordErrors.confirmPassword
            ? { confirmPassword: passwordErrors.confirmPassword }
            : {}),
        },
      },
      { status: 400 }
    );
  }

  if (readFormText(formData, "termsAccepted") !== "on") {
    return NextResponse.json(
      {
        fieldErrors: { termsAccepted: REGISTRATION_TERMS_REQUIRED_MESSAGE },
      },
      { status: 400 }
    );
  }

  try {
    const result = await requestRegistrationVerification({
      email: readFormText(formData, "email"),
      password,
      ownerName: readFormText(formData, "ownerName"),
      practiceName: readFormText(formData, "practiceName"),
      slug: readFormText(formData, "slug"),
      serviceCategories: formData
        .getAll("serviceCategories")
        .filter((value): value is string => typeof value === "string"),
      commercialPlan: readFormText(formData, "commercialPlan"),
      billingInterval: readFormText(formData, "billingInterval"),
    });

    if (result.status === "accepted") {
      return registrationGenericSuccess();
    }
    if (result.status === "slug_unavailable") {
      return NextResponse.json(
        { fieldErrors: { slug: result.message } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { fieldErrors: { [result.field]: result.message } },
      { status: 400 }
    );
  } catch {
    return registrationGenericSuccess();
  }
}
