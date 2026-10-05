import type { Metadata } from "next";
import Link from "next/link";

import { loadBillingPageContext } from "@/app/(staff)/account/billing/billing-context";
import { ChangePlanPanel } from "@/app/(staff)/account/billing/change-plan-panel";
import { ManageBillingForm } from "@/app/(staff)/account/billing/manage-billing-form";
import { PaymentRecoveryNotice } from "@/app/(staff)/account/billing/payment-recovery-notice";
import { DowngradeGuideSelectionForm } from "@/app/(staff)/account/billing/downgrade-guide-selection-form";
import {
  BILLING_COMPLETE_PATH,
  BILLING_SETUP_PATH,
} from "@/lib/billing/activation-gate";
import {
  ENDED_BILLING_MESSAGE,
  RESTRICTED_BILLING_MESSAGE,
} from "@/lib/billing/billing-presentation";
import { canViewCommercialBillingNotices } from "@/lib/billing/notices/permissions";
import { BILLING_PRICE_CHANGE_ANCHOR } from "@/lib/billing/notices/constants";
import { PRODUCT_NAME } from "@/lib/branding/product-name";

export const metadata: Metadata = {
  title: `Billing · ${PRODUCT_NAME}`,
};

export default async function BillingStatusPage({
  searchParams,
}: {
  searchParams?: Promise<{ "change-plan"?: string; "plan-change"?: string }>;
} = {}) {
  const context = await loadBillingPageContext();
  const params = searchParams ? await searchParams : {};
  const view = context.view;
  const presentation = view?.presentation;
  const showCommercialDetail = canViewCommercialBillingNotices({
    role: context.membership?.role ?? null,
    source: context.membership?.source,
  });
  const commercial = showCommercialDetail
    ? (view?.commercialDetail ?? null)
    : null;
  const canManageBilling =
    view?.portalEligible === true &&
    context.membership?.role === "ADMIN" &&
    context.membership.source !== "operator_support";
  const paymentRecovery = commercial?.paymentRecovery ?? null;
  const recoveryPortal = canManageBilling
    ? "open"
    : view?.portalEligible
      ? "administrator"
      : "unavailable";
  const canChangePlan =
    context.membership?.role === "ADMIN" &&
    context.membership.source !== "operator_support";
  const downgrade = view?.selfServeDowngrade ?? null;
  const showReview = Boolean(
    downgrade &&
    !view?.scheduledPlanChange &&
    (downgrade.preparationStatus !== "none" ||
      downgrade.attemptOpen ||
      params["change-plan"] === "essential")
  );
  const showEntry = Boolean(
    downgrade?.entryAvailable &&
    !view?.scheduledPlanChange &&
    !showReview &&
    canChangePlan
  );
  const showScheduled = Boolean(view?.scheduledPlanChange);

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
          Account
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Billing</h1>
      </header>

      {!view || !presentation || presentation.kind === "support" ? (
        <section
          className="rounded-xl border border-staff-line bg-staff-panel p-5"
          role="status"
        >
          <p className="text-sm text-staff-muted">
            Billing for this clinic is arranged with River Aftercare.
          </p>
        </section>
      ) : (
        <section className="min-w-0 rounded-xl border border-staff-line bg-staff-panel p-5 sm:p-6">
          <div className="max-w-xl">
            <h2 className="text-base font-semibold">{view.clinicName}</h2>
            {paymentRecovery ? (
              <PaymentRecoveryNotice
                recovery={paymentRecovery}
                portal={recoveryPortal}
              />
            ) : null}
            {paymentRecovery && canManageBilling ? <ManageBillingForm /> : null}
            {paymentRecovery && canManageBilling ? (
              <p className="mt-3 text-sm text-staff-muted">
                Payment methods, invoices, and cancellation are managed in
                Stripe. This page updates after Stripe confirms a change.
              </p>
            ) : null}
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-staff-muted">Plan</dt>
                <dd className="font-medium">{view.planLabel}</dd>
              </div>
              <div>
                <dt className="text-staff-muted">Billing</dt>
                <dd className="font-medium">
                  {view.complimentary ? "Complimentary" : view.intervalLabel}
                </dd>
              </div>
              <div>
                <dt className="text-staff-muted">Status</dt>
                <dd>
                  <span
                    className="staffStatusPill"
                    data-tone={
                      presentation.kind === "active" &&
                      (!presentation.attention ||
                        (!showCommercialDetail &&
                          presentation.attention === "past_due"))
                        ? "success"
                        : presentation.kind === "inactive"
                          ? "inactive"
                          : "warning"
                    }
                  >
                    {view.complimentary
                      ? view.complimentary.accessLabel
                      : presentation.kind === "active" &&
                          presentation.attention === "cancel_scheduled"
                        ? "Scheduled to end"
                        : presentation.kind === "active" &&
                            presentation.attention === "past_due" &&
                            showCommercialDetail
                          ? "Payment issue"
                          : presentation.kind === "active"
                            ? "Active"
                            : presentation.kind === "processing"
                              ? "Payment processing"
                              : presentation.kind === "restricted" &&
                                  showCommercialDetail
                                ? "Unpaid"
                                : presentation.kind === "restricted"
                                  ? "Billing"
                                  : presentation.kind === "inactive"
                                    ? "Ended"
                                    : view.billingLabel}
                  </span>
                </dd>
              </div>
              {showCommercialDetail && commercial?.currentPriceLabel ? (
                <div>
                  <dt className="text-staff-muted">Price</dt>
                  <dd className="font-medium">
                    {commercial.currentPriceLabel}
                  </dd>
                </div>
              ) : null}
              {showCommercialDetail &&
              view.paidThroughLabel &&
              (presentation.kind === "active" ||
                presentation.kind === "restricted" ||
                presentation.kind === "inactive") ? (
                <div>
                  <dt className="text-staff-muted">{view.periodLabel}</dt>
                  <dd className="font-medium">{view.paidThroughLabel}</dd>
                </div>
              ) : null}
            </dl>
            {showCommercialDetail &&
            presentation.kind === "active" &&
            presentation.attentionMessage &&
            !paymentRecovery ? (
              <p className="mt-4 text-sm" role="status">
                {presentation.attentionMessage}
              </p>
            ) : null}
            {commercial?.annualReminder ? (
              <p className="mt-4 text-sm leading-6" role="status">
                {commercial.annualReminder.title}{" "}
                {commercial.annualReminder.body}
              </p>
            ) : null}
            {commercial?.priceChange ? (
              <div
                id={BILLING_PRICE_CHANGE_ANCHOR}
                className="mt-4 scroll-mt-24 text-sm leading-6"
                role="status"
              >
                <p className="font-medium">{commercial.priceChange.title}</p>
                <p className="mt-1 text-staff-muted">
                  {commercial.priceChange.body} Current price{" "}
                  {commercial.priceChange.currentPriceLabel}. New price{" "}
                  {commercial.priceChange.newPriceLabel}. Billing interval{" "}
                  {commercial.priceChange.intervalLabel}. Effective{" "}
                  {commercial.priceChange.effectiveLabel}.
                </p>
                <a
                  href={context.contactHref}
                  className="mt-2 inline-flex font-medium text-staff-brand underline-offset-2 hover:underline"
                >
                  Contact River Aftercare
                </a>
              </div>
            ) : null}
            {view.scheduledPlanChange && !showScheduled ? (
              <p className="mt-4 text-sm" role="status">
                Scheduled change:{" "}
                {view.scheduledPlanChange.operatorLines.scheduledChange}.{" "}
                {view.scheduledPlanChange.customerMessage}
              </p>
            ) : null}
          </div>
          {showScheduled && view.scheduledPlanChange && downgrade ? (
            <ChangePlanPanel
              phase="scheduled"
              canAct={canChangePlan}
              showPrices={showCommercialDetail}
              intervalLabel={downgrade.intervalLabel}
              essentialPriceLabel={downgrade.essentialPriceLabel}
              effectiveLabel={downgrade.effectiveLabel}
              teamCurrent={downgrade.teamCurrent}
              teamLimit={downgrade.teamLimit}
              guidesFit={downgrade.guidesFit}
              combinedCurrent={downgrade.combinedCurrent}
              combinedLimit={downgrade.combinedLimit}
              preparationStatus={downgrade.preparationStatus}
              selectedCombined={downgrade.selectedCombined}
              scheduleReady={false}
              blockedMessage={null}
              canCancelPreparation={false}
              scheduledEffectiveLabel={view.scheduledPlanChange.effectiveLabel}
            />
          ) : null}
          {showScheduled && view.scheduledPlanChange && !downgrade ? (
            <p className="mt-4 text-sm" role="status">
              Scheduled change:{" "}
              {view.scheduledPlanChange.operatorLines.scheduledChange}.{" "}
              {view.scheduledPlanChange.customerMessage}
            </p>
          ) : null}
          {showEntry && downgrade ? (
            <ChangePlanPanel
              phase="entry"
              canAct={canChangePlan}
              showPrices={showCommercialDetail}
              intervalLabel={downgrade.intervalLabel}
              essentialPriceLabel={downgrade.essentialPriceLabel}
              effectiveLabel={downgrade.effectiveLabel}
              teamCurrent={downgrade.teamCurrent}
              teamLimit={downgrade.teamLimit}
              guidesFit={downgrade.guidesFit}
              combinedCurrent={downgrade.combinedCurrent}
              combinedLimit={downgrade.combinedLimit}
              preparationStatus={downgrade.preparationStatus}
              selectedCombined={downgrade.selectedCombined}
              scheduleReady={downgrade.scheduleReady}
              blockedMessage={downgrade.blockedMessage}
              canCancelPreparation={downgrade.canCancelPreparation}
              arrivalNotice={
                params["plan-change"] === "cancelled" ? "cancelled" : null
              }
            />
          ) : null}
          {showReview && downgrade ? (
            <ChangePlanPanel
              phase="review"
              canAct={canChangePlan}
              showPrices={showCommercialDetail}
              intervalLabel={downgrade.intervalLabel}
              essentialPriceLabel={downgrade.essentialPriceLabel}
              effectiveLabel={downgrade.effectiveLabel}
              teamCurrent={downgrade.teamCurrent}
              teamLimit={downgrade.teamLimit}
              guidesFit={downgrade.guidesFit}
              combinedCurrent={downgrade.combinedCurrent}
              combinedLimit={downgrade.combinedLimit}
              preparationStatus={downgrade.preparationStatus}
              selectedCombined={downgrade.selectedCombined}
              scheduleReady={downgrade.scheduleReady}
              blockedMessage={downgrade.blockedMessage}
              canCancelPreparation={downgrade.canCancelPreparation}
              guideEditor={
                view.guideSelection ? (
                  <DowngradeGuideSelectionForm
                    panel={view.guideSelection}
                    canConfirm={canChangePlan}
                    placement="review"
                  />
                ) : null
              }
            />
          ) : null}
          {view.guideSelection && !showReview ? (
            <div className="mt-5 border-t border-staff-line pt-5">
              <h3 className="text-sm font-semibold">Practice → Essential</h3>
              <DowngradeGuideSelectionForm
                panel={view.guideSelection}
                canConfirm={canChangePlan}
              />
            </div>
          ) : null}
          <div className="max-w-xl">
            {view.complimentary && showCommercialDetail ? (
              <p className="mt-4 text-sm" role="status">
                {view.complimentary.productAccess
                  ? `Complimentary ${view.complimentary.planLabel} access is ${view.complimentary.expiresLabel === "Indefinite" ? "indefinite" : `open until ${view.complimentary.expiresLabel}`}.`
                  : `Complimentary ${view.complimentary.planLabel} access ended on ${view.complimentary.expiresLabel}. Clinic editing is unavailable. Published patient guides stay available.`}
                {view.complimentary.reviewLabel
                  ? ` Commercial review ${view.complimentary.reviewLabel}.`
                  : ""}
              </p>
            ) : null}
            {view.complimentary && !showCommercialDetail ? (
              <p className="mt-4 text-sm text-staff-muted" role="status">
                Your account administrator manages complimentary access for this
                clinic.
              </p>
            ) : null}
            {view.complimentary && !view.complimentary.productAccess ? (
              <a
                href={context.contactHref}
                className="mt-3 inline-flex text-sm font-medium text-staff-brand"
              >
                Contact River Aftercare
              </a>
            ) : null}
            {showCommercialDetail && view.negotiatedOffer ? (
              <div className="mt-4 border-t border-staff-line pt-4 text-sm">
                <h3 className="font-semibold">Negotiated price</h3>
                <dl className="mt-3 grid gap-2">
                  <div>
                    <dt className="text-staff-muted">Plan</dt>
                    <dd className="font-medium">
                      {view.negotiatedOffer.planLabel}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-staff-muted">Billing</dt>
                    <dd className="font-medium">
                      {view.negotiatedOffer.intervalLabel}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-staff-muted">Price</dt>
                    <dd className="font-medium">
                      {view.negotiatedOffer.priceLabel}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-staff-muted">Tax</dt>
                    <dd className="font-medium">
                      {view.negotiatedOffer.taxLabel}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-staff-muted">Offer</dt>
                    <dd className="font-medium">
                      {view.negotiatedOffer.status === "CHECKOUT_OPEN"
                        ? "Checkout open"
                        : "Prepared"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-staff-muted">Payment from</dt>
                    <dd className="font-medium">
                      {view.negotiatedOffer.startLabel}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-staff-muted">Price term</dt>
                    <dd className="font-medium">
                      Continues until a later written change
                    </dd>
                  </div>
                </dl>
                <p className="mt-3">{view.negotiatedOffer.policyLabel}</p>
                <p className="mt-2 text-staff-muted">
                  {view.negotiatedOffer.terms}
                </p>
                {view.negotiatedOffer.waitingForStart ? (
                  <p className="mt-3" role="status">
                    Payment stays closed until {view.negotiatedOffer.startLabel}
                    . Complimentary access does not start a charge on its own.
                  </p>
                ) : null}
                {view.negotiatedOffer.payable &&
                context.membership?.role === "ADMIN" &&
                context.membership.source !== "operator_support" ? (
                  <Link
                    href={BILLING_SETUP_PATH}
                    className="staffBtn staffBtnPrimary mt-4 inline-flex h-11 items-center"
                  >
                    Review and pay
                  </Link>
                ) : null}
              </div>
            ) : null}
            {presentation.kind === "active" &&
            !view.complimentary &&
            !presentation.attention &&
            presentation.assistedSetup ? (
              <p className="mt-4 text-sm" role="status">
                Your Practice plan is active. We’ll help you get your River
                Aftercare setup ready.
              </p>
            ) : null}
            {presentation.kind === "restricted" &&
            showCommercialDetail &&
            !paymentRecovery ? (
              <p className="mt-4 text-sm text-staff-muted" role="status">
                {RESTRICTED_BILLING_MESSAGE}
              </p>
            ) : null}
            {presentation.kind === "restricted" && !showCommercialDetail ? (
              <p className="mt-4 text-sm text-staff-muted" role="status">
                Your account administrator manages billing for this clinic.
              </p>
            ) : null}
            {presentation.kind === "inactive" && !view.complimentary ? (
              <p className="mt-4 text-sm text-staff-muted" role="status">
                {ENDED_BILLING_MESSAGE}
                {view.publicGuideRetentionLabel
                  ? ` Published patient guides remain available until ${view.publicGuideRetentionLabel}.`
                  : ""}
              </p>
            ) : null}
            {presentation.kind === "setup" &&
            context.membership?.role === "ADMIN" &&
            context.membership.source !== "operator_support" ? (
              <Link
                href={BILLING_SETUP_PATH}
                className="staffBtn staffBtnPrimary mt-5 inline-flex h-11 items-center"
              >
                Continue billing setup
              </Link>
            ) : null}
            {presentation.kind === "processing" ? (
              <Link
                href={BILLING_COMPLETE_PATH}
                className="staffBtn staffBtnSecondary mt-5 inline-flex h-11 items-center"
              >
                View payment status
              </Link>
            ) : null}
            {presentation.kind === "retry" ? (
              <p className="mt-4 text-sm text-staff-muted" role="status">
                We haven’t confirmed payment yet. Clinic access stays closed
                until payment is confirmed.
              </p>
            ) : null}
            {presentation.kind === "retry" &&
            presentation.canRestartCheckout ? (
              <Link
                href={BILLING_SETUP_PATH}
                className="staffBtn staffBtnPrimary mt-5 inline-flex h-11 items-center"
              >
                Return to billing setup
              </Link>
            ) : null}
            {canManageBilling && !paymentRecovery ? (
              <ManageBillingForm />
            ) : null}
            {view.portalEligible && !canManageBilling && !paymentRecovery ? (
              <p className="mt-4 text-sm text-staff-muted">
                A clinic administrator can manage payment methods, invoices, and
                cancellation.
              </p>
            ) : null}
            {canManageBilling && !paymentRecovery ? (
              <p className="mt-3 text-sm text-staff-muted">
                Payment methods, invoices, and cancellation are managed in
                Stripe. This page updates after Stripe confirms a change.
              </p>
            ) : null}
            {presentation.kind === "active" ||
            presentation.kind === "restricted" ||
            presentation.kind === "inactive" ||
            presentation.kind === "retry" ? (
              <div className="mt-5 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <a
                  href={context.contactHref}
                  className="staffBtn staffBtnSecondary inline-flex h-11 w-full items-center sm:w-auto"
                >
                  Contact River Aftercare
                </a>
                {presentation.kind === "active" ? (
                  <Link
                    href="/dashboard"
                    className={
                      canManageBilling || presentation.attention
                        ? "staffBtn staffBtnSecondary inline-flex h-11 w-full items-center sm:w-auto"
                        : "staffBtn staffBtnPrimary inline-flex h-11 w-full items-center sm:w-auto"
                    }
                  >
                    Continue
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
}
