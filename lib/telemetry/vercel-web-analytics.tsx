"use client";

import { Analytics } from "@vercel/analytics/next";
import type { BeforeSendEvent } from "@vercel/analytics/next";

export function vercelWebAnalyticsBeforeSend(
  event: BeforeSendEvent
): BeforeSendEvent | null {
  if (localStorage.getItem("va-disable") === "1") {
    return null;
  }
  return event;
}

export function VercelWebAnalytics() {
  return <Analytics beforeSend={vercelWebAnalyticsBeforeSend} />;
}
