import { ComplimentaryAccessForm } from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/complimentary-access-form";
import type { ComplimentaryAccessView } from "@/lib/billing/complimentary-access";
import { INACTIVE_CLINIC_EDIT_NOTE } from "@/lib/clinics/inactive-clinic-copy";

export function ComplimentaryAccessPanel({
  clinicId,
  access,
  formBlockedReason,
  editsLocked = false,
  lockedNote = INACTIVE_CLINIC_EDIT_NOTE,
}: {
  clinicId: string;
  access: ComplimentaryAccessView;
  formBlockedReason?: string | null;
  editsLocked?: boolean;
  lockedNote?: string;
}) {
  return (
    <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
      <h2 className="text-base font-semibold">Complimentary access</h2>
      <p className="mt-2 text-sm leading-6 text-staff-muted">
        Grant Essential or Practice for a collaboration. Choose six months, 12
        months, a custom end date, or indefinite access. This does not create a
        Stripe subscription.
      </p>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-staff-muted">Arrangement</dt>
          <dd>{access.mode === "extend" ? "Complimentary" : "None"}</dd>
        </div>
        <div>
          <dt className="text-staff-muted">Plan</dt>
          <dd>{access.planLabel}</dd>
        </div>
        <div>
          <dt className="text-staff-muted">Access</dt>
          <dd>
            {access.phase === "none"
              ? "Not granted"
              : access.phase === "active"
                ? "Active"
                : "Ended"}
          </dd>
        </div>
        <div>
          <dt className="text-staff-muted">Expiry</dt>
          <dd>{access.expiresLabel ?? "Not granted"}</dd>
        </div>
        <div>
          <dt className="text-staff-muted">Commercial review</dt>
          <dd>{access.reviewLabel ?? "Not set"}</dd>
        </div>
      </dl>
      {access.events.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">History</h3>
          <ul className="mt-2 divide-y divide-staff-line">
            {access.events.map((event) => (
              <li key={event.id} className="py-3 text-sm">
                <p className="font-medium">
                  {event.kindLabel} · {event.planLabel} · {event.recordedLabel}
                </p>
                <p className="mt-1 text-staff-muted">
                  {event.actorLabel}. Previous expiry{" "}
                  {event.previousExpiryLabel}. New expiry{" "}
                  {event.nextExpiryLabel}.
                  {event.reviewLabel ? ` Review ${event.reviewLabel}.` : ""}
                </p>
                <p className="mt-1">{event.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {formBlockedReason ? (
        <p className="mt-4 text-sm text-staff-muted">{formBlockedReason}</p>
      ) : editsLocked ? (
        <p className="mt-4 text-sm text-staff-muted">{lockedNote}</p>
      ) : (
        <ComplimentaryAccessForm
          key={`${access.mode}-${access.events.length}`}
          clinicId={clinicId}
          mode={access.mode}
          plan={access.plan}
        />
      )}
    </section>
  );
}
