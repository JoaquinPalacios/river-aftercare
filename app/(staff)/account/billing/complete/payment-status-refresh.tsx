"use client";

import { useEffect, useState } from "react";

const POLL_INTERVAL_MS = 8_000;
const MAX_POLLS = 15;

export function PaymentStatusRefresh({ enabled }: { enabled: boolean }) {
  const [stopped, setStopped] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let attempts = 0;
    let timer = 0;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) {
        return;
      }
      attempts += 1;
      try {
        const response = await fetch("/api/billing/status", {
          cache: "no-store",
        });
        if (response.ok) {
          const body = (await response.json()) as { state?: string };
          if (body.state === "active") {
            window.location.reload();
            return;
          }
        }
      } catch {
        // The webhook does not depend on this page staying open.
      }

      if (attempts >= MAX_POLLS) {
        setStopped(true);
        return;
      }
      timer = window.setTimeout(() => {
        void tick();
      }, POLL_INTERVAL_MS);
    };

    timer = window.setTimeout(() => {
      void tick();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  return (
    <p className="text-sm text-staff-muted" role="status">
      {stopped
        ? "You can close this page. We’ll keep processing your payment."
        : "This page checks your River Aftercare payment status for a couple of minutes. You can close it. We’ll keep processing your payment."}
    </p>
  );
}
