"use client";

import { Analytics } from "@vercel/analytics/next";
import type { BeforeSendEvent } from "@vercel/analytics/next";

export function vercelWebAnalyticsBeforeSend(
  event: BeforeSendEvent
): BeforeSendEvent | null {
  if (localStorage.getItem("va-disable") === "1") {
    return null;
  }

  try {
    const url = new URL(event.url);
    if (
      (url.pathname === "/reset-password" ||
        url.pathname === "/accept-invitation") &&
      url.hash
    ) {
      url.hash = "";
      return { ...event, url: url.toString() };
    }
  } catch {
    return event;
  }

  return event;
}

export function VercelWebAnalytics() {
  return <Analytics beforeSend={vercelWebAnalyticsBeforeSend} />;
}
