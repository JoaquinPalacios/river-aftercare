import "server-only";

export type StripeBillingLogEvent =
  | {
      event: "stripe_webhook_received";
      stripeEventId: string;
      eventType: string;
    }
  | {
      event: "stripe_webhook_duplicate";
      stripeEventId: string;
      eventType: string;
      clinicId?: string | null;
    }
  | {
      event: "stripe_webhook_processed";
      stripeEventId: string;
      eventType: string;
      clinicId?: string | null;
      outcome: string;
    }
  | {
      event: "stripe_webhook_ignored";
      stripeEventId: string;
      eventType: string;
    }
  | {
      event: "stripe_webhook_unknown_price";
      stripeEventId: string;
      eventType: string;
      clinicId?: string | null;
      stripePriceId: string;
    }
  | {
      event: "stripe_webhook_unknown_clinic";
      stripeEventId: string;
      eventType: string;
    }
  | {
      event: "stripe_webhook_failed";
      stripeEventId?: string;
      eventType?: string;
      clinicId?: string | null;
      reason: string;
    }
  | {
      event: "stripe_webhook_signature_rejected";
      reason: "missing" | "invalid" | "malformed";
    }
  | {
      event: "stripe_webhook_not_configured";
    };

export function logStripeBilling(entry: StripeBillingLogEvent): void {
  if (
    entry.event === "stripe_webhook_failed" ||
    entry.event === "stripe_webhook_unknown_price" ||
    entry.event === "stripe_webhook_unknown_clinic" ||
    entry.event === "stripe_webhook_not_configured"
  ) {
    console.error(entry);
    return;
  }

  console.info(entry);
}
