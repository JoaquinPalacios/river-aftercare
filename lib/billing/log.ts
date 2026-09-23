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
    }
  | {
      event: "billing_onboarding_prepared";
      clinicId: string;
      commercialPlan: string;
      billingInterval: string;
    }
  | {
      event: "stripe_customer_created" | "stripe_customer_reused";
      clinicId: string;
    }
  | {
      event: "checkout_session_created" | "checkout_session_reused";
      clinicId: string;
      commercialPlan: string;
      billingInterval: string;
    }
  | {
      event: "checkout_session_failed";
      clinicId: string;
      reason: string;
    }
  | {
      event: "legal_acceptance_recorded";
      clinicId: string;
      userId: string;
      termsVersion: string;
      privacyVersionAcknowledged: string;
      source: string;
    }
  | {
      event: "billing_entitlement_activated";
      clinicId: string;
      eventType: string;
    }
  | {
      event: "customer_portal_session_created";
      clinicId: string;
    }
  | {
      event: "customer_portal_session_failed";
      clinicId: string;
      reason: string;
    }
  | {
      event: "plan_upgrade_submitted";
      clinicId: string;
      billingInterval: string;
    }
  | {
      event: "plan_upgrade_failed";
      clinicId: string;
      reason: string;
    }
  | {
      event: "plan_downgrade_deferred";
      clinicId: string;
    };

export function logStripeBilling(entry: StripeBillingLogEvent): void {
  if (
    entry.event === "stripe_webhook_failed" ||
    entry.event === "stripe_webhook_unknown_price" ||
    entry.event === "stripe_webhook_unknown_clinic" ||
    entry.event === "stripe_webhook_not_configured" ||
    entry.event === "checkout_session_failed" ||
    entry.event === "customer_portal_session_failed" ||
    entry.event === "plan_upgrade_failed"
  ) {
    console.error(entry);
    return;
  }

  console.info(entry);
}
