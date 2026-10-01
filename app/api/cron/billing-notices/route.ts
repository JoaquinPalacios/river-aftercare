import { NextResponse } from "next/server";

import {
  billingNoticeCronAuthorized,
  billingNoticeCronHostAllowed,
} from "@/lib/billing/notices/cron-auth";
import { runBillingNoticeJob } from "@/lib/billing/notices/run";
import { reportServerException } from "@/lib/observability/report-server-exception";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const result = await runBillingNoticeJob();
    return NextResponse.json({
      ok: true,
      examined: result.examined,
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped,
    });
  } catch (error) {
    reportServerException(error, { tags: { component: "billing-notice" } });
    return NextResponse.json(
      { error: "Billing notices could not be processed." },
      { status: 500 }
    );
  }
}
