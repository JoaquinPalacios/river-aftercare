import { NextResponse } from "next/server";

import { logStripeBilling } from "@/lib/billing/log";
import { processVerifiedStripeEvent } from "@/lib/billing/webhook-processor";
import { verifyStripeWebhookEvent } from "@/lib/billing/verify-webhook";
import {
  OPERATIONAL_FAILURE_CODES,
  reportOperationalFailure,
  reportServerException,
} from "@/lib/observability/report-server-exception";
import { isStaffAppHost } from "@/lib/tenancy/staff-app-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC_WEBHOOK_ERROR = {
  error: "Stripe webhook could not be processed.",
};

export async function POST(request: Request) {
  if (!isStaffAppHost(request.headers.get("host"))) {
    return new NextResponse(null, { status: 404 });
  }

  let payload: string;
  try {
    payload = await request.text();
  } catch {
    logStripeBilling({
      event: "stripe_webhook_signature_rejected",
      reason: "malformed",
    });
    return NextResponse.json(
      { error: "Malformed Stripe webhook payload." },
      { status: 400 }
    );
  }

  const verification = await verifyStripeWebhookEvent(
    payload,
    request.headers.get("stripe-signature")
  );

  if (!verification.ok) {
    if (verification.reason === "not_configured") {
      logStripeBilling({ event: "stripe_webhook_not_configured" });
      reportOperationalFailure(
        OPERATIONAL_FAILURE_CODES.STRIPE_WEBHOOK_NOT_CONFIGURED,
        { component: "stripe-webhook", failure_code: "not_configured" }
      );
    } else {
      logStripeBilling({
        event: "stripe_webhook_signature_rejected",
        reason: verification.reason,
      });
    }
    return NextResponse.json(
      { error: verification.error },
      { status: verification.status }
    );
  }

  try {
    await processVerifiedStripeEvent(verification.event);
    return NextResponse.json({ received: true });
  } catch (error) {
    logStripeBilling({
      event: "stripe_webhook_failed",
      stripeEventId: verification.event.id,
      eventType: verification.event.type,
      reason: "processing_failed",
    });
    reportServerException(error, { tags: { component: "stripe-webhook" } });
    reportOperationalFailure(OPERATIONAL_FAILURE_CODES.STRIPE_WEBHOOK_FAILED, {
      component: "stripe-webhook",
      failure_code: "processing_failed",
    });
    return NextResponse.json(GENERIC_WEBHOOK_ERROR, { status: 500 });
  }
}
