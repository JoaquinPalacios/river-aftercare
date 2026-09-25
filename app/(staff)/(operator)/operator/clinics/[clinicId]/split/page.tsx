import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BackArrowIcon } from "@/app/(staff)/components/icons";
import { PortalBreadcrumb } from "@/app/(staff)/components/portal-breadcrumb";
import {
  CancelSplitPreparationForm,
  CreateSplitPreparationForm,
  CreateSplitShellForm,
  SplitSiteDecisionsForm,
  SplitStaffForm,
  SplitTargetForm,
} from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/split/split-forms";
import { requireAccountSplitOperator } from "@/lib/account-split/authorize";
import {
  EXECUTION_NOT_IN_THIS_RELEASE,
  PUBLIC_URLS_UNCHANGED_STATEMENT,
} from "@/lib/account-split/policy";
import {
  previewAccountSplit,
  revalidateAccountSplitPreparation,
} from "@/lib/account-split/preparation";
import {
  findLatestCancelledAccountSplit,
  findOpenAccountSplitPreparation,
} from "@/lib/account-split/snapshot";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { getPrisma } from "@/lib/prisma";

interface SplitPageProps {
  params: Promise<{ clinicId: string }>;
}

export const metadata: Metadata = {
  title: `Account split · ${PRODUCT_NAME}`,
};

export default async function AccountSplitPreparationPage({
  params,
}: SplitPageProps) {
  await requireAccountSplitOperator();
  const { clinicId } = await params;
  const clinic = await getPrisma().clinic.findUnique({
    where: { id: clinicId },
    select: {
      id: true,
      name: true,
      slug: true,
      entitlement: { select: { commercialPlan: true } },
      sites: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          displayName: true,
          slug: true,
          active: true,
          isPrimary: true,
        },
      },
    },
  });
  if (!clinic) {
    notFound();
  }

  const open = await findOpenAccountSplitPreparation(clinic.id);
  if (open) {
    await revalidateAccountSplitPreparation(open.id);
  }
  const preview = open ? await previewAccountSplit(open.id) : null;
  const preparation = preview
    ? await getPrisma().clinicAccountSplitPreparation.findUnique({
        where: { id: open!.id },
        select: {
          id: true,
          status: true,
          destinationPlan: true,
          destinationBillingInterval: true,
          targetSourcePlan: true,
          expectedConfirmation: true,
          destinationClinicId: true,
        },
      })
    : null;
  const cancelled = preparation
    ? null
    : await findLatestCancelledAccountSplit(clinic.id);
  const staffRows =
    preparation && preview
      ? await loadStaffRows(clinic.id, preparation.id)
      : [];
  const activeSiteCount = clinic.sites.filter((site) => site.active).length;
  const canStart =
    clinic.entitlement?.commercialPlan === "GROUP" && activeSiteCount > 1;

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-6">
      <header>
        <PortalBreadcrumb
          items={[
            { href: "/operator/clinics", label: "All Clinics" },
            { href: `/operator/clinics/${clinic.id}`, label: clinic.name },
            { label: "Account split" },
          ]}
        />
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
          Platform
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Account split / downgrade preparation
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-staff-muted">
          Prepare one Group site to become its own Account. Nothing is moved,
          copied, or billed from this page. You can leave and resume an open
          preparation.
        </p>
      </header>

      <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
        <h2 className="text-base font-semibold">Source</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-staff-muted">Account</dt>
            <dd>{clinic.name}</dd>
          </div>
          <div>
            <dt className="text-staff-muted">Current plan</dt>
            <dd>{clinic.entitlement?.commercialPlan ?? "No entitlement"}</dd>
          </div>
          <div>
            <dt className="text-staff-muted">Active sites</dt>
            <dd>{activeSiteCount}</dd>
          </div>
          <div>
            <dt className="text-staff-muted">Preview target</dt>
            <dd>Practice. Billing is not converted here.</dd>
          </div>
        </dl>
        {preview ? (
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-staff-muted">Site that stays</dt>
              <dd>
                {preview.keptSite
                  ? `${preview.keptSite.displayName} · ${preview.keptSite.slug}`
                  : "Missing"}
              </dd>
            </div>
            <div>
              <dt className="text-staff-muted">After this split</dt>
              <dd>
                {preview.sourcePreview.activeSiteCount} active site
                {preview.sourcePreview.activeSiteCount === 1 ? "" : "s"},{" "}
                {preview.sourcePreview.activeLocationCount} active location
                {preview.sourcePreview.activeLocationCount === 1
                  ? ""
                  : "s"}, {preview.sourcePreview.teamUsed} of{" "}
                {preview.sourcePreview.teamLimit} team places
              </dd>
            </div>
            <div>
              <dt className="text-staff-muted">Guides that would remain</dt>
              <dd>
                {preview.sourcePreview.customGuides} custom,{" "}
                {preview.sourcePreview.adaptedGuides} adapted,{" "}
                {preview.sourcePreview.combinedGuides} clinic-owned
              </dd>
            </div>
          </dl>
        ) : null}
      </section>

      {!preparation ? (
        <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
          <h2 className="text-base font-semibold">Start</h2>
          {canStart ? (
            <>
              <p className="mt-2 text-sm text-staff-muted">
                Choose the site that stays. Every other site needs an explicit
                Split or Deactivate decision after this starts. One preparation
                covers one destination Account.
              </p>
              <CreateSplitPreparationForm
                sourceClinicId={clinic.id}
                sites={clinic.sites}
              />
            </>
          ) : (
            <p className="mt-2 text-sm text-staff-muted">
              Split preparation is for a Group account with more than one active
              site.
            </p>
          )}
          {cancelled?.destinationClinic ? (
            <p className="mt-4 text-sm">
              The last cancelled preparation left destination shell{" "}
              {cancelled.destinationClinic.name} (
              {cancelled.destinationClinic.slug}). It was not deleted.
            </p>
          ) : null}
        </section>
      ) : (
        <>
          <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
            <h2 className="text-base font-semibold">Destination</h2>
            <p className="mt-2 text-sm text-staff-muted">
              Status: {preparation.status}. Target {preparation.destinationPlan}{" "}
              {preparation.destinationBillingInterval}. Source target{" "}
              {preparation.targetSourcePlan} is preview only.
            </p>
            {preview?.destinationPreview.compatibilitySlug ? (
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-staff-muted">Shell account</dt>
                  <dd>{preview.destinationPreview.accountName}</dd>
                </div>
                <div>
                  <dt className="text-staff-muted">Compatibility slug</dt>
                  <dd>{preview.destinationPreview.compatibilitySlug}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-staff-muted">Hostname</dt>
                  <dd>
                    {preview.destinationPreview.siteHostname ?? "Not chosen"}{" "}
                    stays the patient hostname.{" "}
                    {preview.destinationPreview.compatibilitySlugNote}
                  </dd>
                </div>
                <div>
                  <dt className="text-staff-muted">Branding</dt>
                  <dd>Unchanged. Existing object URLs stay where they are.</dd>
                </div>
                <div>
                  <dt className="text-staff-muted">Allowance</dt>
                  <dd>
                    {preview.destinationPreview.siteUsed} of{" "}
                    {preview.destinationPreview.siteLimit} sites,{" "}
                    {preview.destinationPreview.locationUsed} of{" "}
                    {preview.destinationPreview.locationLimit} locations,{" "}
                    {preview.destinationPreview.teamUsed} of{" "}
                    {preview.destinationPreview.teamLimit} team members
                  </dd>
                </div>
              </dl>
            ) : (
              <CreateSplitShellForm
                sourceClinicId={clinic.id}
                preparationId={preparation.id}
                disabled={!preview?.splitSite}
              />
            )}
            {preparation.destinationClinicId ? (
              <p className="mt-3 text-sm">
                <Link
                  href={`/operator/clinics/${preparation.destinationClinicId}`}
                  className="font-medium text-staff-brand"
                >
                  Open destination account
                </Link>
              </p>
            ) : null}
            <SplitTargetForm
              sourceClinicId={clinic.id}
              preparationId={preparation.id}
              plan={
                preparation.destinationPlan === "ESSENTIAL"
                  ? "ESSENTIAL"
                  : "PRACTICE"
              }
              interval={preparation.destinationBillingInterval}
            />
          </section>

          <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
            <h2 className="text-base font-semibold">Sites</h2>
            <p className="mt-2 text-sm text-staff-muted">
              The kept site stays. Exactly one other site can be split. Every
              remaining site must be marked Deactivate. Inactive historical
              sites can stay on the source once they are explicitly deactivated
              here.
            </p>
            <SplitSiteDecisionsForm
              key={clinic.sites
                .map(
                  (site) => `${site.id}:${preview?.splitSite?.id === site.id}`
                )
                .join("|")}
              sourceClinicId={clinic.id}
              preparationId={preparation.id}
              sites={clinic.sites
                .filter((site) => site.id !== preview?.keptSite?.id)
                .map((site) => ({
                  ...site,
                  decision:
                    preview?.splitSite?.id === site.id
                      ? "SPLIT"
                      : preview?.sourcePreview.deactivatedSiteIds.includes(
                            site.id
                          )
                        ? "DEACTIVATE"
                        : null,
                }))}
            />
          </section>

          <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
            <h2 className="text-base font-semibold">Staff</h2>
            <p className="mt-2 text-sm text-staff-muted">
              People stay on the source Account unless you move them. One person
              cannot be active in both accounts. The destination needs an
              administrator who will not remain an active source member.
              Memberships are not changed here. Outstanding invitations stay on
              the source and are listed under validation.
            </p>
            <SplitStaffForm
              key={staffRows
                .map((member) => `${member.userId}:${member.placement}`)
                .join("|")}
              sourceClinicId={clinic.id}
              preparationId={preparation.id}
              members={staffRows}
            />
          </section>

          <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
            <h2 className="text-base font-semibold">Guides</h2>
            <p className="mt-2 text-sm text-staff-muted">
              Dry run only. Nothing is copied. A later execution would copy
              draft version 0, every published revision, sections, overrides,
              additions, template references, and historical review users.
              Cross-account provenance stays on the split mapping tables.
            </p>
            {preview ? (
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-staff-muted">Guides to copy</dt>
                  <dd>{preview.destinationPreview.guideCount}</dd>
                </div>
                <div>
                  <dt className="text-staff-muted">Revisions</dt>
                  <dd>
                    {preview.destinationPreview.revisionCount} (
                    {preview.destinationPreview.draftRevisionCount} draft,{" "}
                    {preview.destinationPreview.publishedRevisionCount}{" "}
                    published)
                  </dd>
                </div>
                <div>
                  <dt className="text-staff-muted">Placements</dt>
                  <dd>
                    {preview.destinationPreview.placementCount},{" "}
                    {preview.destinationPreview.pinnedPlacementCount} pinned
                  </dd>
                </div>
                <div>
                  <dt className="text-staff-muted">Template-backed</dt>
                  <dd>{preview.destinationPreview.templateBackedGuideCount}</dd>
                </div>
                <div>
                  <dt className="text-staff-muted">
                    Shared with the kept site
                  </dt>
                  <dd>{preview.destinationPreview.sharedWithKeptSiteCount}</dd>
                </div>
              </dl>
            ) : null}
            {preview && preview.destinationPreview.guides.length > 0 ? (
              <ul className="mt-3 divide-y divide-staff-line text-sm">
                {preview.destinationPreview.guides.map((guide) => (
                  <li key={guide.id} className="py-2">
                    {guide.title} · /{guide.publicSlug}
                    {guide.templateBacked ? " · template" : ""}
                    {guide.sharedWithKeptSite ? " · shared" : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
            <h2 className="text-base font-semibold">Billing</h2>
            <p className="mt-2 text-sm text-staff-muted">
              Use the destination account’s existing offer and Checkout. This
              page reads the local entitlement projection. It does not call
              Stripe and does not change the source subscription.
            </p>
            <p className="mt-3 text-sm">
              {preview?.blockers.find(
                (blocker) => blocker.code === "billing_not_ready"
              )?.message ?? "Destination billing matches the preparation."}
            </p>
          </section>

          <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
            <h2 className="text-base font-semibold">Validation</h2>
            {preview?.destinationPreview.publicUrlStatement ===
            PUBLIC_URLS_UNCHANGED_STATEMENT ? (
              <p className="mt-3 text-sm font-medium">
                {PUBLIC_URLS_UNCHANGED_STATEMENT}
              </p>
            ) : (
              <p className="mt-3 text-sm">
                Public URL continuity is not confirmed until the moving site is
                chosen and its placements are consistent.
              </p>
            )}
            {preview && preview.destinationPreview.publicUrls.length > 0 ? (
              <ul className="mt-2 text-sm text-staff-muted">
                {preview.destinationPreview.publicUrls.map((url) => (
                  <li key={url.placementId}>
                    {url.hostname}
                    {url.path}
                  </li>
                ))}
              </ul>
            ) : null}
            <h3 className="mt-4 text-sm font-semibold">Blockers</h3>
            {preview && preview.blockers.length > 0 ? (
              <ul className="mt-2 list-disc pl-5 text-sm">
                {preview.blockers.map((blocker) => (
                  <li key={blocker.code}>{blocker.message}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm">No blockers.</p>
            )}
            <h3 className="mt-4 text-sm font-semibold">Warnings</h3>
            {preview && preview.warnings.length > 0 ? (
              <ul className="mt-2 list-disc pl-5 text-sm">
                {preview.warnings.map((warning) => (
                  <li key={warning.code}>{warning.message}</li>
                ))}
              </ul>
            ) : null}
            <h3 className="mt-4 text-sm font-semibold">
              Future execution phrase
            </h3>
            <p className="mt-2 font-mono text-sm">
              {preparation.expectedConfirmation ??
                preview?.confirmationPhrase ??
                "split {siteSlug}"}
            </p>
            <p className="mt-2 text-sm text-staff-muted">
              {EXECUTION_NOT_IN_THIS_RELEASE}
            </p>
            <CancelSplitPreparationForm
              sourceClinicId={clinic.id}
              preparationId={preparation.id}
            />
          </section>
        </>
      )}

      <p>
        <Link
          href={`/operator/clinics/${clinic.id}`}
          className="staffBtn staffBtnQuiet gap-1 px-0"
        >
          <BackArrowIcon />
          Clinic
        </Link>
      </p>
    </div>
  );
}

async function loadStaffRows(clinicId: string, preparationId: string) {
  const [memberships, selections] = await Promise.all([
    getPrisma().clinicMembership.findMany({
      where: { clinicId, active: true },
      orderBy: { createdAt: "asc" },
      select: {
        userId: true,
        role: true,
        user: { select: { name: true, email: true } },
      },
    }),
    getPrisma().clinicAccountSplitStaffSelection.findMany({
      where: { preparationId },
      select: {
        userId: true,
        keepOnSource: true,
        grantOnDestination: true,
        destinationRole: true,
      },
    }),
  ]);
  const byUser = new Map(
    selections.map((selection) => [selection.userId, selection])
  );
  return memberships.map((membership) => {
    const selection = byUser.get(membership.userId);
    const placement =
      selection?.grantOnDestination && !selection.keepOnSource
        ? ("destination" as const)
        : selection
          ? ("source" as const)
          : null;
    return {
      userId: membership.userId,
      name: membership.user.name,
      email: membership.user.email,
      role: membership.role,
      placement,
      destinationRole: selection?.destinationRole ?? membership.role,
    };
  });
}
