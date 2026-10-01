import type { PaymentRecoveryDetail } from "@/lib/billing/notices/types";

export type PaymentRecoveryPortal = "open" | "administrator" | "unavailable";

const PORTAL_LIMITATION = {
  administrator:
    "A clinic administrator can open Stripe billing to update the payment method and review invoices.",
  unavailable:
    "Stripe billing cannot be opened for this account from this page. Contact River Aftercare to review the payment method and invoices.",
} as const;

export function PaymentRecoveryNotice({
  recovery,
  portal,
}: {
  recovery: PaymentRecoveryDetail;
  portal: PaymentRecoveryPortal;
}) {
  const pastDue = recovery.severity === "past_due";
  return (
    <section
      className={
        pastDue
          ? "mt-4 min-w-0 rounded-xl border border-staff-warning-line border-l-4 bg-staff-warning-surface px-4 py-3 text-staff-warning-text sm:px-5"
          : "mt-4 min-w-0 rounded-xl border border-staff-line border-l-4 border-l-staff-danger bg-staff-panel px-4 py-3 sm:px-5"
      }
      data-payment-recovery={recovery.severity}
      role="region"
      aria-labelledby="payment-recovery-title"
    >
      <h3
        id="payment-recovery-title"
        className={
          pastDue
            ? "text-sm font-medium leading-6 text-staff-warning-text"
            : "text-sm font-medium leading-6 text-staff-ink"
        }
      >
        {recovery.title}
      </h3>
      <p
        className={
          pastDue
            ? "mt-1 text-sm leading-6 text-staff-warning-text"
            : "mt-1 text-sm leading-6 text-staff-muted"
        }
      >
        {recovery.body}
      </p>
      <dl className="mt-3 grid gap-2 text-sm">
        {recovery.planLabel ? (
          <div>
            <dt
              className={
                pastDue ? "text-staff-warning-text" : "text-staff-muted"
              }
            >
              Plan
            </dt>
            <dd className="font-medium">{recovery.planLabel}</dd>
          </div>
        ) : null}
        {recovery.intervalLabel ? (
          <div>
            <dt
              className={
                pastDue ? "text-staff-warning-text" : "text-staff-muted"
              }
            >
              Billing
            </dt>
            <dd className="font-medium">{recovery.intervalLabel}</dd>
          </div>
        ) : null}
        <div>
          <dt
            className={pastDue ? "text-staff-warning-text" : "text-staff-muted"}
          >
            Billing state
          </dt>
          <dd className="font-medium">{recovery.stateLabel}</dd>
        </div>
      </dl>
      <p
        className={
          pastDue
            ? "mt-3 text-sm leading-6 text-staff-warning-text"
            : "mt-3 text-sm leading-6 text-staff-muted"
        }
      >
        {recovery.instructions}
      </p>
      {portal === "open" ? null : (
        <p
          className={
            pastDue
              ? "mt-3 text-sm leading-6 text-staff-warning-text"
              : "mt-3 text-sm leading-6 text-staff-muted"
          }
          role="status"
        >
          {PORTAL_LIMITATION[portal]}
        </p>
      )}
    </section>
  );
}
