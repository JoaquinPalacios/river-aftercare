import {
  NegotiatedOfferForm,
  WithdrawNegotiatedOfferForm,
} from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/negotiated-offer-form";
import type { NegotiatedOfferPanel as NegotiatedOfferPanelData } from "@/lib/billing/negotiated-offer";

export function NegotiatedOfferPanel({
  clinicId,
  panel,
}: {
  clinicId: string;
  panel: NegotiatedOfferPanelData;
}) {
  const open = panel.offers.some((offer) => offer.open);
  const planLabel =
    panel.plan === "PRACTICE"
      ? "Practice"
      : panel.plan === "ESSENTIAL"
        ? "Essential"
        : "the current plan";

  return (
    <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
      <h2 className="text-base font-semibold">Negotiated price</h2>
      <p className="mt-2 text-sm leading-6 text-staff-muted">
        Prepare one paid price for this complimentary clinic. The clinic
        administrator accepts the terms and pays. Complimentary access stays
        until that payment is confirmed.
      </p>
      {panel.offers.length > 0 ? (
        <ul className="mt-4 divide-y divide-staff-line">
          {panel.offers.map((offer) => (
            <li key={offer.id} className="py-3 text-sm">
              <p className="font-medium">
                {offer.statusLabel} · {offer.planLabel} · {offer.intervalLabel}{" "}
                · {offer.priceLabel}
              </p>
              <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-staff-muted">Tax</dt>
                  <dd>{offer.taxLabel}</dd>
                </div>
                <div>
                  <dt className="text-staff-muted">Payment from</dt>
                  <dd>{offer.startLabel}</dd>
                </div>
                <div>
                  <dt className="text-staff-muted">Price term</dt>
                  <dd>Continues until a later written change</dd>
                </div>
                <div>
                  <dt className="text-staff-muted">Status</dt>
                  <dd>{offer.statusLabel}</dd>
                </div>
              </dl>
              <p className="mt-2">{offer.policyLabel}</p>
              <p className="mt-2 text-staff-muted">{offer.terms}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-staff-muted">
          No negotiated price yet.
        </p>
      )}
      {panel.blockedReason ? (
        <p className="mt-4 text-sm text-staff-muted">{panel.blockedReason}</p>
      ) : null}
      {open ? <WithdrawNegotiatedOfferForm clinicId={clinicId} /> : null}
      {panel.canPrepare ? (
        <NegotiatedOfferForm clinicId={clinicId} planLabel={planLabel} />
      ) : null}
    </section>
  );
}
