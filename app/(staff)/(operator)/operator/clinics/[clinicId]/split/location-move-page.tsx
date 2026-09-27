import Link from "next/link";

import { BackArrowIcon } from "@/app/(staff)/components/icons";
import { PortalBreadcrumb } from "@/app/(staff)/components/portal-breadcrumb";
import {
  CancelSplitPreparationForm,
  ConfirmLocationDestinationSlugForm,
  CreateLocationMovePreparationForm,
  CreateSplitShellForm,
  ExecuteSplitForm,
  PrepareSplitBrandingForm,
  SaveLocationMoveSelectionForm,
  SplitStaffForm,
  SplitTargetForm,
  type LocationMoveOption,
} from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/split/split-forms";
import { loadAccountSplitExecutionSummary } from "@/lib/account-split/execute";
import { supportedLocationToNewAccountAction } from "@/lib/account-split/location-policy";
import {
  previewAccountSplit,
  revalidateAccountSplitPreparation,
} from "@/lib/account-split/preparation";
import {
  findLatestCancelledAccountSplit,
  findLatestCompletedAccountSplit,
  findOpenAccountSplitPreparation,
} from "@/lib/account-split/snapshot";
import { suggestSiteSlug } from "@/lib/clinics/slug-suggestion";
import { getPrisma } from "@/lib/prisma";

type LocationMoveClinic = {
  id: string;
  name: string;
  slug: string;
  entitlement: { commercialPlan: string | null } | null;
  sites: Array<{
    id: string;
    displayName: string;
    slug: string;
    active: boolean;
    isPrimary: boolean;
  }>;
};

export async function LocationMovePreparationPage({
  clinic,
}: {
  clinic: LocationMoveClinic;
}) {
  const locations = await loadLocationOptions(clinic);
  const eligibleCount = locations.filter(
    (location) => location.eligible
  ).length;
  const open = await findOpenAccountSplitPreparation(clinic.id);
  const locationOpen = open?.operationKind === "LOCATION_TO_NEW_ACCOUNT";
  if (locationOpen && open) {
    await revalidateAccountSplitPreparation(open.id);
  }
  const preview =
    locationOpen && open ? await previewAccountSplit(open.id) : null;
  const preparation =
    preview && open
      ? await getPrisma().clinicAccountSplitPreparation.findUnique({
          where: { id: open.id },
          select: {
            id: true,
            status: true,
            destinationPlan: true,
            destinationBillingInterval: true,
            destinationClinicId: true,
            destinationSiteSlug: true,
            sourceLocationId: true,
            preparationRevision: true,
            keptClinicSiteId: true,
          },
        })
      : null;
  const completed = preparation
    ? null
    : await findLatestCompletedAccountSplit(clinic.id);
  const completedSummary =
    completed?.operationKind === "LOCATION_TO_NEW_ACCOUNT"
      ? await loadAccountSplitExecutionSummary(completed.id)
      : null;
  const cancelled =
    preparation || completedSummary
      ? null
      : await findLatestCancelledAccountSplit(clinic.id);
  const staffRows =
    preparation && preview
      ? await loadStaffRows(clinic.id, preparation.id)
      : [];
  const canStart = supportedLocationToNewAccountAction({
    commercialPlan: clinic.entitlement?.commercialPlan ?? null,
    eligibleLocationCount: eligibleCount,
    hasOpenPreparation: Boolean(preparation),
  }).available;
  const moving = preview?.locationMove?.location ?? null;
  const oldSlug = preview?.locationMove?.oldSlug ?? moving?.slug ?? null;
  const suggestion = suggestSiteSlug(moving?.displayName ?? "location");
  const sourceSite = clinic.sites.find(
    (site) => site.id === preparation?.keptClinicSiteId
  );

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-6">
      <header>
        <PortalBreadcrumb
          items={[
            { href: "/operator/clinics", label: "All Clinics" },
            { href: `/operator/clinics/${clinic.id}`, label: clinic.name },
            { label: "Move location" },
          ]}
        />
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
          Platform
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Move location to new account
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-staff-muted">
          Move one non-root location from this Practice Account onto a new
          Essential or Practice Account. The location becomes that
          Account&apos;s Clinic Site. The source Clinic Site and its root
          location stay. The old public address keeps working. This is not
          reversed automatically, and it does not change what the source Account
          has purchased.
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
            <dt className="text-staff-muted">Clinic Site</dt>
            <dd>
              {sourceSite
                ? `${sourceSite.displayName} · ${sourceSite.slug}`
                : clinic.sites
                    .filter((site) => site.active)
                    .map((site) => site.displayName)
                    .join(", ") || "None"}
            </dd>
          </div>
          <div>
            <dt className="text-staff-muted">Eligible locations</dt>
            <dd>{eligibleCount}</dd>
          </div>
        </dl>
      </section>

      {completedSummary ? (
        <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
          <h2 className="text-base font-semibold">Completed move</h2>
          <p className="mt-2 text-sm text-staff-muted">
            This location has moved. Running it again returns the same result
            and does not create another Clinic Site.
          </p>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-staff-muted">Source Account</dt>
              <dd>
                {completedSummary.source.name} · {completedSummary.source.slug}
              </dd>
            </div>
            <div>
              <dt className="text-staff-muted">Destination Account</dt>
              <dd>
                {completedSummary.destination.name} ·{" "}
                {completedSummary.destination.slug}
              </dd>
            </div>
            <div>
              <dt className="text-staff-muted">New Clinic Site</dt>
              <dd>
                {completedSummary.movedSite.displayName} ·{" "}
                {completedSummary.movedSite.slug}
              </dd>
            </div>
            <div>
              <dt className="text-staff-muted">Guide copies</dt>
              <dd>{completedSummary.guideCopyCount}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      {!preparation ? (
        <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
          <h2 className="text-base font-semibold">Start</h2>
          {canStart ? (
            <>
              <p className="mt-2 text-sm text-staff-muted">
                Choose one active location that is not the root. The root
                location stays on this Account.
              </p>
              <CreateLocationMovePreparationForm
                sourceClinicId={clinic.id}
                locations={locations}
              />
            </>
          ) : (
            <p className="mt-2 text-sm text-staff-muted">
              A Practice Account can move one active non-root location onto a
              new Essential or Practice Account. This Account does not have an
              eligible location. A root location cannot move.
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
      ) : preview && preparation ? (
        <>
          <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
            <h2 className="text-base font-semibold">Location</h2>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-staff-muted">Name</dt>
                <dd>{moving?.displayName ?? "Not selected"}</dd>
              </div>
              <div>
                <dt className="text-staff-muted">Current public path</dt>
                <dd className="font-mono">
                  {oldSlug ? `/${oldSlug}` : "None"}
                </dd>
              </div>
              <div>
                <dt className="text-staff-muted">Root</dt>
                <dd>{moving?.servesSiteRoot ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt className="text-staff-muted">Active</dt>
                <dd>{moving ? (moving.active ? "Yes" : "No") : "No"}</dd>
              </div>
              <div>
                <dt className="text-staff-muted">Primary today</dt>
                <dd>
                  {preview.locationMove?.departingLocationWasPrimary
                    ? "Yes. The source root location becomes primary."
                    : "No"}
                </dd>
              </div>
              <div>
                <dt className="text-staff-muted">Reviewed revision</dt>
                <dd>{preparation.preparationRevision}</dd>
              </div>
            </dl>
            <SaveLocationMoveSelectionForm
              key={`${preparation.sourceLocationId}:${preparation.preparationRevision}`}
              sourceClinicId={clinic.id}
              preparationId={preparation.id}
              locations={locations.filter(
                (location) =>
                  location.clinicSiteId === preparation.keptClinicSiteId
              )}
              selectedLocationId={preparation.sourceLocationId}
            />
          </section>

          <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
            <h2 className="text-base font-semibold">Destination</h2>
            <p className="mt-2 text-sm text-staff-muted">
              Status: {preparation.status}. Plan {preparation.destinationPlan}{" "}
              {preparation.destinationBillingInterval}. The new Account is empty
              until this move runs.
            </p>
            {preview.destinationPreview.compatibilitySlug ? (
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-staff-muted">Shell Account</dt>
                  <dd>{preview.destinationPreview.accountName}</dd>
                </div>
                <div>
                  <dt className="text-staff-muted">Compatibility slug</dt>
                  <dd>{preview.destinationPreview.compatibilitySlug}</dd>
                </div>
                <div>
                  <dt className="text-staff-muted">Future hostname</dt>
                  <dd>
                    {preview.locationMove?.destinationSiteSlug ??
                      "Not confirmed"}
                  </dd>
                </div>
                <div>
                  <dt className="text-staff-muted">Allowance</dt>
                  <dd>
                    {preview.destinationPreview.siteUsed} of{" "}
                    {preview.destinationPreview.siteLimit} sites,{" "}
                    {preview.destinationPreview.locationUsed} of{" "}
                    {preview.destinationPreview.locationLimit} locations
                  </dd>
                </div>
              </dl>
            ) : (
              <CreateSplitShellForm
                sourceClinicId={clinic.id}
                preparationId={preparation.id}
                disabled={!moving || moving.servesSiteRoot || !moving.slug}
              />
            )}
            <ConfirmLocationDestinationSlugForm
              key={`${preparation.destinationSiteSlug ?? ""}:${suggestion}`}
              sourceClinicId={clinic.id}
              preparationId={preparation.id}
              confirmedSlug={preparation.destinationSiteSlug}
              suggestion={suggestion}
            />
            {preparation.destinationClinicId ? (
              <p className="mt-3 text-sm">
                <Link
                  href={`/operator/clinics/${preparation.destinationClinicId}`}
                  className="font-medium text-staff-brand"
                >
                  Open destination Account
                </Link>
                {". "}
                <Link
                  href={`/operator/clinics/${preparation.destinationClinicId}/team/invite`}
                  className="font-medium text-staff-brand"
                >
                  Invite destination admin
                </Link>
                . The person accepts Terms and Privacy and completes Checkout on
                the destination Account. This page does not accept legal terms.
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
            <h2 className="text-base font-semibold">Staff</h2>
            <p className="mt-2 text-sm text-staff-muted">
              Each person stays on the source Account or moves to the
              destination Account. One person cannot be active in both. The
              destination needs an administrator. Pending invitations stay on
              the source. Platform operators are not moved.
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
              Only guides placed on the moving location are copied. A guide that
              is also placed elsewhere stays on the source and is copied for the
              destination. Guides are not shared across Accounts and are not
              deleted to make this fit.
            </p>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-staff-muted">Guides to copy</dt>
                <dd>
                  {preview.destinationPreview.guideCount} of{" "}
                  {preview.destinationPreview.guideCount} selected, capacity{" "}
                  {preview.destinationPreview.teamLimit > 0
                    ? "checked with the destination plan"
                    : "waiting on the destination plan"}
                </dd>
              </div>
              <div>
                <dt className="text-staff-muted">Placements</dt>
                <dd>{preview.destinationPreview.placementCount}</dd>
              </div>
            </dl>
            {preview.destinationPreview.guides.length > 0 ? (
              <ul className="mt-3 divide-y divide-staff-line text-sm">
                {preview.destinationPreview.guides.map((guide) => (
                  <li key={guide.id} className="py-2">
                    {guide.title}
                    {oldSlug ? (
                      <span className="text-staff-muted">
                        {" "}
                        · /{oldSlug}/{guide.publicSlug} becomes /
                        {guide.publicSlug}
                      </span>
                    ) : null}
                    {guide.sharedWithKeptSite ? " · also stays on source" : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm">
                No guides are placed on this location.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
            <h2 className="text-base font-semibold">Readiness</h2>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-staff-muted">Billing</dt>
                <dd>
                  {preview.blockers.some(
                    (blocker) => blocker.code === "billing_not_ready"
                  )
                    ? "Not ready"
                    : preview.billing.phase === "ready"
                      ? "Ready"
                      : "Not ready"}
                </dd>
              </div>
              <div>
                <dt className="text-staff-muted">Branding</dt>
                <dd>
                  {preview.blockers.some(
                    (blocker) => blocker.code === "branding_assets_not_ready"
                  )
                    ? "Not ready"
                    : "Ready"}
                </dd>
              </div>
              <div>
                <dt className="text-staff-muted">Move</dt>
                <dd>
                  {preview.status === "READY_TO_EXECUTE"
                    ? "Ready"
                    : "Not ready"}
                </dd>
              </div>
              <div>
                <dt className="text-staff-muted">Reviewed revision</dt>
                <dd>{preparation.preparationRevision}</dd>
              </div>
            </dl>
            <h3 className="mt-4 text-sm font-semibold">Blockers</h3>
            {preview.blockers.length > 0 ? (
              <ul className="mt-2 list-disc pl-5 text-sm">
                {preview.blockers.map((blocker) => (
                  <li key={blocker.code}>{blocker.message}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm">No blockers.</p>
            )}
            <h3 className="mt-4 text-sm font-semibold">Warnings</h3>
            {preview.warnings.length > 0 ? (
              <ul className="mt-2 list-disc pl-5 text-sm">
                {preview.warnings.map((warning) => (
                  <li key={warning.code}>{warning.message}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm">No warnings.</p>
            )}
            {preview.status === "READY_TO_EXECUTE" &&
            preview.confirmationPhrase ? (
              <div className="mt-4 rounded-lg border border-staff-line p-4">
                <h3 className="text-sm font-semibold">Move this location</h3>
                <div className="mt-3 grid gap-4 text-sm lg:grid-cols-2">
                  <div>
                    <p className="font-medium">This will</p>
                    <ul className="mt-2 list-disc pl-5">
                      <li>
                        Move {moving?.displayName ?? "the location"} onto a new
                        Clinic Site
                      </li>
                      <li>
                        Keep {oldSlug ? `/${oldSlug}` : "the old address"}{" "}
                        working
                      </li>
                      <li>
                        Copy {preview.destinationPreview.guideCount} guide
                        {preview.destinationPreview.guideCount === 1 ? "" : "s"}
                      </li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium">This will not</p>
                    <ul className="mt-2 list-disc pl-5">
                      <li>Move the root location</li>
                      <li>
                        Reduce the source Account&apos;s purchased capacity
                      </li>
                      <li>Call Stripe or send email</li>
                      <li>Undo the move automatically</li>
                    </ul>
                  </div>
                </div>
                <ExecuteSplitForm
                  sourceClinicId={clinic.id}
                  preparationId={preparation.id}
                  preparationRevision={preparation.preparationRevision}
                  confirmationPhrase={preview.confirmationPhrase}
                  submitLabel="Move location"
                />
              </div>
            ) : (
              <>
                {preparation.destinationClinicId &&
                preview.blockers.some(
                  (blocker) => blocker.code === "branding_assets_not_ready"
                ) ? (
                  <PrepareSplitBrandingForm
                    sourceClinicId={clinic.id}
                    preparationId={preparation.id}
                    description="Copy the source Clinic Site logo, dark logo, and favicon onto the destination Account. The new Clinic Site is created when the location moves."
                  />
                ) : null}
                <p className="mt-4 text-sm text-staff-muted">
                  The move stays closed until this preparation is ready.
                  {preview.confirmationPhrase ? (
                    <>
                      {" "}
                      The confirmation will be{" "}
                      <span className="font-mono">
                        {preview.confirmationPhrase}
                      </span>
                      .
                    </>
                  ) : null}
                </p>
              </>
            )}
            <CancelSplitPreparationForm
              sourceClinicId={clinic.id}
              preparationId={preparation.id}
            />
          </section>
        </>
      ) : null}

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

async function loadLocationOptions(
  clinic: LocationMoveClinic
): Promise<LocationMoveOption[]> {
  const rows = await getPrisma().clinicLocation.findMany({
    where: { clinicId: clinic.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      clinicSiteId: true,
      name: true,
      displayName: true,
      slug: true,
      addressLine1: true,
      city: true,
      active: true,
      servesSiteRoot: true,
      isPrimary: true,
    },
  });
  const sites = new Map(clinic.sites.map((site) => [site.id, site]));
  const activeRootSiteIds = new Set(
    rows
      .filter((row) => row.servesSiteRoot && row.active)
      .map((row) => row.clinicSiteId)
  );
  return rows.map((row) => {
    const site = sites.get(row.clinicSiteId);
    const address = [row.addressLine1, row.city].filter(Boolean).join(", ");
    const eligible = Boolean(
      site?.active &&
      row.active &&
      !row.servesSiteRoot &&
      row.slug &&
      activeRootSiteIds.has(row.clinicSiteId)
    );
    return {
      id: row.id,
      clinicSiteId: row.clinicSiteId,
      siteName: site?.displayName ?? "Clinic Site",
      name: row.displayName || row.name,
      slug: row.slug ?? "",
      address: address || "No address",
      active: row.active,
      servesSiteRoot: row.servesSiteRoot,
      isPrimary: row.isPrimary,
      eligible,
    };
  });
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
