import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { NegotiatedOfferPanel } from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/negotiated-offer-panel";
import { OnboardingAdminForm } from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/setup/onboarding-admin-form";
import { OnboardingCommercialArrangement } from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/setup/onboarding-commercial-forms";
import { OnboardingExit } from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/setup/onboarding-exit";
import { OnboardingInvitationActions } from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/setup/onboarding-invitation-actions";
import { OnboardingProgressList } from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/setup/onboarding-progress";
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
import { assistedClinicCanBeDiscarded } from "@/lib/operator/discard-assisted-clinic";

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
  const canDiscard = onboarding.assistedOnboarding
    ? await assistedClinicCanBeDiscarded(clinicId)
    : false;
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
        <p className="mt-3 text-base font-medium">{onboarding.clinicName}</p>
        <p className="text-sm text-staff-muted">{onboarding.slug}</p>
      </header>

      <OnboardingProgressList items={progress} />

      {onboarding.commercial.configured ? (
        <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
          <h2 className="text-base font-semibold">Commercial arrangement</h2>
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
        <OnboardingCommercialArrangement clinicId={onboarding.clinicId} />
      ) : (
        <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
          <h2 className="text-base font-semibold">Commercial arrangement</h2>
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
          <h2 className="text-base font-semibold">Administrator</h2>
          <p className="mt-2 text-sm leading-6 text-staff-muted">
            Invite the first clinic administrator. Later administrators and
            staff are managed on Team.
          </p>
          <OnboardingAdminForm clinicId={onboarding.clinicId} />
        </section>
      ) : null}

      {onboarding.assistedOnboarding && !onboarding.commercial.configured ? (
        <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
          <h2 className="text-base font-semibold">Administrator</h2>
          <p className="mt-2 text-sm leading-6 text-staff-muted">
            Available after commercial setup.
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

      {onboarding.assistedOnboarding ? (
        <OnboardingExit
          clinicId={onboarding.clinicId}
          canDiscard={canDiscard}
        />
      ) : null}
    </div>
  );
}
