import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { NegotiatedOfferPanel } from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/negotiated-offer-panel";
import { OnboardingAdminForm } from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/setup/onboarding-admin-form";
import {
  OnboardingComplimentaryForm,
  OnboardingStandardOfferForm,
} from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/setup/onboarding-commercial-forms";
import { OnboardingInvitationActions } from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/setup/onboarding-invitation-actions";
import { PortalBreadcrumb } from "@/app/(staff)/components/portal-breadcrumb";
import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import { loadNegotiatedOfferPanel } from "@/lib/billing/negotiated-offer";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { clinicPatientSiteUrl } from "@/lib/clinic-portal/patient-site-url";
import {
  administratorStatusLabel,
  loadClinicOnboarding,
  onboardingProgress,
  ownerHandoffSteps,
} from "@/lib/operator/clinic-onboarding";

interface ClinicSetupPageProps {
  params: Promise<{ clinicId: string }>;
}

export const metadata: Metadata = {
  title: `Clinic setup · ${PRODUCT_NAME}`,
};

export default async function ClinicSetupPage({
  params,
}: ClinicSetupPageProps) {
  await requirePlatformOperator();
  const { clinicId } = await params;
  const onboarding = await loadClinicOnboarding(clinicId);
  if (!onboarding) {
    notFound();
  }

  const negotiatedPanel =
    onboarding.commercial.configured &&
    onboarding.commercial.kind === "complimentary"
      ? await loadNegotiatedOfferPanel(clinicId)
      : null;
  const progress = onboardingProgress(onboarding);
  const showHandoff =
    onboarding.assistedOnboarding &&
    onboarding.administrator.state !== "not_invited";
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");
  const patientSiteHref = host
    ? clinicPatientSiteUrl({
        requestHost: host,
        clinicSlug: onboarding.slug,
        protocol,
      })
    : null;

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-6">
      <header>
        <PortalBreadcrumb
          items={[
            { href: "/operator/clinics", label: "All Clinics" },
            {
              href: `/operator/clinics/${onboarding.clinicId}`,
              label: onboarding.clinicName,
            },
            { label: "Setup" },
          ]}
        />
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
          Platform
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Clinic setup
        </h1>
        <p className="mt-2 text-sm text-staff-muted">
          {onboarding.clinicName} · {onboarding.slug}
        </p>
        <Link
          href={`/operator/clinics/${onboarding.clinicId}`}
          className="mt-3 inline-flex text-sm font-medium text-staff-brand"
        >
          Open clinic details
        </Link>
      </header>

      <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
        <h2 className="text-base font-semibold">Progress</h2>
        <ol className="mt-4 flex flex-col gap-2 text-sm">
          {progress.map((item) => (
            <li
              key={item.id}
              data-complete={item.complete ? "true" : "false"}
              className={item.complete ? "font-medium" : "text-staff-muted"}
            >
              {item.label}
            </li>
          ))}
        </ol>
      </section>

      {onboarding.commercial.configured ? (
        <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
          <h2 className="text-base font-semibold">Commercial access</h2>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-staff-muted">Functional plan</dt>
              <dd>{onboarding.commercial.planLabel}</dd>
            </div>
            <div>
              <dt className="text-staff-muted">Arrangement</dt>
              <dd>{onboarding.commercial.arrangementLabel}</dd>
            </div>
            <div>
              <dt className="text-staff-muted">Status</dt>
              <dd>{onboarding.commercial.statusLabel}</dd>
            </div>
            <div>
              <dt className="text-staff-muted">Detail</dt>
              <dd>{onboarding.commercial.detail}</dd>
            </div>
          </dl>
          {onboarding.commercial.kind === "complimentary" ? (
            <p className="mt-4 text-sm leading-6 text-staff-muted">
              After the administrator accepts the invitation, complimentary
              access follows this entitlement.
            </p>
          ) : (
            <p className="mt-4 text-sm leading-6 text-staff-muted">
              The clinic administrator accepts the current legal terms and
              authorises payment in Account billing. Checkout does not start
              from this page.
            </p>
          )}
        </section>
      ) : onboarding.assistedOnboarding ? (
        <>
          <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
            <h2 className="text-base font-semibold">Complimentary access</h2>
            <p className="mt-2 text-sm leading-6 text-staff-muted">
              Grant Essential or Practice for six months, 12 months, a custom
              end date, or indefinite access. A reason is required. This uses
              the existing complimentary agreement and does not create a Stripe
              subscription.
            </p>
            <OnboardingComplimentaryForm clinicId={onboarding.clinicId} />
          </section>
          <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
            <h2 className="text-base font-semibold">Standard paid offer</h2>
            <p className="mt-2 text-sm leading-6 text-staff-muted">
              Prepare the existing Essential or Practice catalogue offer. The
              clinic administrator accepts the terms and pays through clinic
              billing.
            </p>
            <OnboardingStandardOfferForm clinicId={onboarding.clinicId} />
          </section>
          <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
            <h2 className="text-base font-semibold">Negotiated paid pricing</h2>
            <p className="mt-2 text-sm leading-6 text-staff-muted">
              Negotiated pricing uses the existing clinic workflow. Grant
              complimentary Essential or Practice first. The negotiated price
              form then appears on this page. Preparing it does not create a
              Stripe Price until the administrator pays.
            </p>
          </section>
        </>
      ) : (
        <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
          <h2 className="text-base font-semibold">Commercial access</h2>
          <p className="mt-2 text-sm leading-6 text-staff-muted">
            This clinic has no commercial record. Historical clinics keep their
            existing access. Complimentary access, a standard offer, and a
            negotiated price are managed on the clinic page.
          </p>
          <Link
            href={`/operator/clinics/${onboarding.clinicId}`}
            className="mt-3 inline-flex text-sm font-medium text-staff-brand"
          >
            Open clinic details
          </Link>
        </section>
      )}

      {negotiatedPanel ? (
        <NegotiatedOfferPanel
          clinicId={onboarding.clinicId}
          panel={negotiatedPanel}
        />
      ) : null}

      {onboarding.assistedOnboarding &&
      onboarding.commercial.configured &&
      onboarding.administrator.state === "not_invited" ? (
        <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
          <h2 className="text-base font-semibold">First administrator</h2>
          <p className="mt-2 text-sm leading-6 text-staff-muted">
            Invite the first clinic administrator. Later administrators and
            staff are managed on Team.
          </p>
          <OnboardingAdminForm clinicId={onboarding.clinicId} />
        </section>
      ) : null}

      {onboarding.assistedOnboarding && !onboarding.commercial.configured ? (
        <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
          <h2 className="text-base font-semibold">First administrator</h2>
          <p className="mt-2 text-sm leading-6 text-staff-muted">
            Commercial access is required before the first administrator can be
            invited.
          </p>
        </section>
      ) : null}

      {showHandoff ? (
        <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
          <h2 className="text-base font-semibold">Handoff</h2>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-staff-muted">Clinic</dt>
              <dd>{onboarding.clinicName}</dd>
            </div>
            <div>
              <dt className="text-staff-muted">Patient hostname</dt>
              <dd>
                {patientSiteHref ? (
                  <a
                    href={patientSiteHref}
                    className="font-medium text-staff-brand"
                  >
                    {patientSiteHref}
                  </a>
                ) : (
                  onboarding.slug
                )}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-staff-muted">Practice categories</dt>
              <dd>
                {onboarding.categoryLabels.length > 0
                  ? onboarding.categoryLabels.join(", ")
                  : "None selected"}
              </dd>
            </div>
            <div>
              <dt className="text-staff-muted">Functional plan</dt>
              <dd>
                {onboarding.commercial.configured
                  ? onboarding.commercial.planLabel
                  : "Not selected"}
              </dd>
            </div>
            <div>
              <dt className="text-staff-muted">Commercial arrangement</dt>
              <dd>
                {onboarding.commercial.configured
                  ? `${onboarding.commercial.arrangementLabel}. ${onboarding.commercial.statusLabel}`
                  : "Not configured"}
              </dd>
            </div>
            <div>
              <dt className="text-staff-muted">Invitation</dt>
              <dd>
                {administratorStatusLabel(onboarding.administrator)}
                {onboarding.administrator.state !== "not_invited"
                  ? ` · ${onboarding.administrator.name?.trim() || onboarding.administrator.email}`
                  : ""}
              </dd>
            </div>
            {onboarding.administrator.state !== "not_invited" ? (
              <div>
                <dt className="text-staff-muted">Email</dt>
                <dd>{onboarding.administrator.email}</dd>
              </div>
            ) : null}
          </dl>
          <h3 className="mt-4 text-sm font-semibold">
            After the owner signs in
          </h3>
          <ul className="mt-2 list-disc pl-5 text-sm leading-6">
            {ownerHandoffSteps(onboarding).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
          {onboarding.administrator.state === "invited" ? (
            <OnboardingInvitationActions
              clinicId={onboarding.clinicId}
              userId={onboarding.administrator.userId}
            />
          ) : null}
          <p className="mt-4 text-sm text-staff-muted">
            Later team changes stay on{" "}
            <Link
              href={`/operator/clinics/${onboarding.clinicId}/team`}
              className="font-medium text-staff-brand"
            >
              Team
            </Link>
            .
          </p>
        </section>
      ) : null}
    </div>
  );
}
