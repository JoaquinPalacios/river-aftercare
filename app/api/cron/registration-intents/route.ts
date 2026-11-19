import { NextResponse } from "next/server";

import { runRegistrationIntentCleanup } from "@/lib/auth/registration-cleanup";
import { logRegistrationLifecycle } from "@/lib/auth/registration-lifecycle-log";
import {
  billingNoticeCronAuthorized,
  billingNoticeCronHostAllowed,
} from "@/lib/billing/notices/cron-auth";
import { reportServerException } from "@/lib/observability/report-server-exception";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily redaction of expired registration password hashes.
 * A failure returns 500 and deletes nothing. The next scheduled run retries.
 * Vercel Cron calls this on the deployment host. Patient hosts are refused.
 */
export async function GET(request: Request) {
  if (!billingNoticeCronHostAllowed(request.headers.get("host"))) {
    return new NextResponse(null, { status: 404 });
  }
  if (
    !billingNoticeCronAuthorized(
      request.headers.get("authorization"),
      process.env.CRON_SECRET
    )
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runRegistrationIntentCleanup();
    return NextResponse.json({ ok: true, revoked: result.revoked });
  } catch (error) {
    logRegistrationLifecycle({
      event: "registration_intent_expiry_failed",
      reason: "cleanup_failed",
    });
    reportServerException(error, {
      tags: { component: "registration-intent-cleanup" },
    });
    return NextResponse.json(
      { error: "Registration cleanup could not be completed." },
      { status: 500 }
    );
  }
}
