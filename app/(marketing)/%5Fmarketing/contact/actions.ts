"use server";

import { headers } from "next/headers";

import {
  getMarketingContactDeliveryConfig,
  isMarketingContactHost,
} from "@/lib/marketing/contact-config";
import {
  CONTACT_HONEYPOT_FIELD,
  contactEnquirySchema,
  contactFieldErrorsFromZod,
  isHoneypotTriggered,
  readContactFormValues,
} from "@/lib/marketing/contact-enquiry";
import {
  CONTACT_DELIVERY_FAILED,
  deliverMarketingContactEnquiry,
} from "@/lib/marketing/contact-mailer";
import {
  getTurnstileSecretKey,
  vercelRequestIp,
  verifyTurnstileToken,
} from "@/lib/marketing/contact-turnstile";
import { readTurnstileToken } from "@/lib/marketing/contact-turnstile-public";

import { type ContactActionState, initialContactActionState } from "./state";

export const CONTACT_VERIFICATION_EXPIRED =
  "Verification expired. Please try again.";

function genericError(
  error: string = CONTACT_DELIVERY_FAILED
): ContactActionState {
  return {
    status: "error",
    error,
    fieldErrors: {},
  };
}

function turnstileUserError(
  reason: "missing" | "failed" | "expired" | "unavailable"
): ContactActionState {
  if (reason === "expired" || reason === "missing") {
    return genericError(CONTACT_VERIFICATION_EXPIRED);
  }
  return genericError();
}

export async function submitMarketingContactAction(
  _previous: ContactActionState = initialContactActionState,
  formData: FormData
): Promise<ContactActionState> {
  const requestHeaders = await headers();
  if (!isMarketingContactHost(requestHeaders.get("host"))) {
    return genericError();
  }

  const token = readTurnstileToken(formData);
  const verification = await verifyTurnstileToken({
    token,
    secret: getTurnstileSecretKey(),
    remoteIp: vercelRequestIp(requestHeaders),
  });
  if (!verification.ok) {
    return turnstileUserError(verification.reason);
  }

  const parsed = contactEnquirySchema.safeParse(
    readContactFormValues(formData)
  );
  if (!parsed.success) {
    return {
      status: "error",
      error: "Please review the highlighted fields.",
      fieldErrors: contactFieldErrorsFromZod(parsed.error),
    };
  }

  if (
    isHoneypotTriggered(parsed.data) ||
    formData.get(CONTACT_HONEYPOT_FIELD)
  ) {
    return genericError();
  }

  const result = await deliverMarketingContactEnquiry(
    parsed.data,
    getMarketingContactDeliveryConfig()
  );

  if (!result.ok) {
    return genericError();
  }

  return { status: "success" };
}
