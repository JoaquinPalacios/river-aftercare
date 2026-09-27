import Link from "next/link";

import { BackArrowIcon } from "@/app/(staff)/components/icons";
import { PortalBreadcrumb } from "@/app/(staff)/components/portal-breadcrumb";
import {
  CancelSplitPreparationForm,
  CanonicalRetargetForm,
  ExecuteSplitForm,
  ExistingGroupDestinationForm,
  ExistingGroupSelectionForm,
  PrepareSplitBrandingForm,
  SplitStaffForm,
} from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/split/split-forms";
import { loadAccountSplitExecutionSummary } from "@/lib/account-split/execute";
import { PUBLIC_URLS_UNCHANGED_STATEMENT } from "@/lib/account-split/policy";
import {
  previewAccountSplit,
  revalidateAccountSplitPreparation,
} from "@/lib/account-split/preparation";
import { isSplitShellCompatibilitySlug } from "@/lib/account-split/shell-slug";
import { findLatestCancelledAccountSplit } from "@/lib/account-split/snapshot";
import { getPrisma } from "@/lib/prisma";

type SourceClinic = {
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

export async function ExistingGroupMovePage({
  clinic,
  preparationId,
}: {
  clinic: SourceClinic;
  preparationId: string;
}) {
  await revalidateAccountSplitPreparation(preparationId);
  const preview = await previewAccountSplit(preparationId);
  const preparation =
    await getPrisma().clinicAccountSplitPreparation.findUnique({
      where: { id: preparationId },
      select: {
        id: true,
        status: true,
        destinationClinicId: true,
        keptClinicSiteId: true,
        preparationRevision: true,
        expectedConfirmation: true,
      },
    });
  if (!preparation || !preview) {
    return null;
  }
  const move = preview.existingGroup;
  const [locations, destinations, staffRows, completed] = await Promise.all([
    getPrisma().clinicLocation.findMany({
      where: { clinicId: clinic.id },
      select: { id: true, clinicSiteId: true, active: true },
    }),
    getPrisma().clinic.findMany({
      where: {
        id: { not: clinic.id },
        entitlement: { commercialPlan: "GROUP" },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
    loadStaffRows(clinic.id, preparation.id),
    preparation.status === "COMPLETED"
      ? loadAccountSplitExecutionSummary(preparation.id)
      : Promise.resolve(null),
  ]);
  const cancelled =
    preparation.status === "CANCELLED"
      ? await findLatestCancelledAccountSplit(clinic.id)
      : null;
  const locationCount = (siteId: string) =>
    locations.filter((location) => location.clinicSiteId === siteId).length;
  const movingSite =
    clinic.sites.find((site) => site.id === move?.movingSiteId) ??
    preview.splitSite;
  const destinationChoices = destinations.filter(
    (destination) => !isSplitShellCompatibilitySlug(destination.slug)
  );

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-6">
      <header>
        <PortalBreadcrumb
          items={[
            { href: "/operator/clinics", label: "All Clinics" },
            { href: `/operator/clinics/${clinic.id}`, label: clinic.name },
            { label: "Move site to existing Group" },
          ]}
        />
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-staff-muted">
          Platform
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Move site to existing Group
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-staff-muted">
          This moves one whole Clinic Site, including every Location, from this
          Group Account into a Group Account that already exists. Public Site
          and Location addresses stay the same. The incoming Site is not
          primary. Neither Account’s subscription or paid capacity changes.
        </p>
      </header>

      <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
        <h2 className="text-base font-semibold">Source Group</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-staff-muted">Account</dt>
            <dd>
              {clinic.name} · {clinic.slug}
            </dd>
          </div>
          <div>
            <dt className="text-staff-muted">Plan</dt>
            <dd>{clinic.entitlement?.commercialPlan ?? "No entitlement"}</dd>
          </div>
          <div>
            <dt className="text-staff-muted">Selected Site</dt>
            <dd>
              {movingSite
                ? `${movingSite.displayName} · ${movingSite.slug}`
                : "Not chosen"}
            </dd>
          </div>
          <div>
            <dt className="text-staff-muted">Hostname</dt>
            <dd>{movingSite?.slug ?? "Not chosen"}</dd>
          </div>
          <div>
            <dt className="text-staff-muted">Locations</dt>
            <dd>{movingSite ? locationCount(movingSite.id) : 0}</dd>
          </div>
          <div>
            <dt className="text-staff-muted">Currently primary</dt>
            <dd>{move?.movingSiteIsPrimary ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt className="text-staff-muted">Reviewed revision</dt>
            <dd>{preparation.preparationRevision}</dd>
          </div>
          <div>
            <dt className="text-staff-muted">Status</dt>
            <dd>{preparation.status}</dd>
          </div>
        </dl>
        <ExistingGroupSelectionForm
          sourceClinicId={clinic.id}
          preparationId={preparation.id}
          sites={clinic.sites}
          movingSiteId={movingSite?.id ?? null}
          keptSiteId={preparation.keptClinicSiteId}
        />
        {preview.primaryPromotion.message ? (
          <p className="mt-3 text-sm">{preview.primaryPromotion.message}</p>
        ) : (
          <p className="mt-3 text-sm text-staff-muted">
            The current source primary Clinic Site stays primary.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
        <h2 className="text-base font-semibold">Destination Group</h2>
        <p className="mt-2 text-sm text-staff-muted">
          Choose a different Group Account. This page does not list this source
          Account, and it does not create a destination Account.
        </p>
        <ExistingGroupDestinationForm
          sourceClinicId={clinic.id}
          preparationId={preparation.id}
          destinationClinicId={preparation.destinationClinicId}
          destinations={destinationChoices}
        />
        {move ? (
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-staff-muted">Destination Account</dt>
              <dd>
                {preview.destinationPreview.accountName}
                {preview.destinationPreview.compatibilitySlug
                  ? ` · ${preview.destinationPreview.compatibilitySlug}`
                  : ""}
              </dd>
            </div>
            <div>
              <dt className="text-staff-muted">Current Site usage</dt>
              <dd>
                {move.destinationActiveSites} of {move.siteAllowance}
              </dd>
            </div>
            <div>
              <dt className="text-staff-muted">Current Location usage</dt>
              <dd>
                {move.destinationActiveLocations} of {move.locationAllowance}
              </dd>
            </div>
            <div>
              <dt className="text-staff-muted">Site usage after the move</dt>
              <dd>
                {move.postMoveActiveSites} of {move.siteAllowance}
              </dd>
            </div>
            <div>
              <dt className="text-staff-muted">
                Location usage after the move
              </dt>
              <dd>
                {move.postMoveActiveLocations} of {move.locationAllowance}
              </dd>
            </div>
            <div>
              <dt className="text-staff-muted">Guides to copy</dt>
              <dd>{move.guidesToCopy}</dd>
            </div>
            <div>
              <dt className="text-staff-muted">Canonical guides to reuse</dt>
              <dd>{move.guidesToRetarget}</dd>
            </div>
          </dl>
        ) : null}
        {preparation.destinationClinicId ? (
          <p className="mt-3 text-sm">
            <Link
              href={`/operator/clinics/${preparation.destinationClinicId}`}
              className="font-medium text-staff-brand"
            >
              Open destination Account
            </Link>
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
        <h2 className="text-base font-semibold">Canonical guides</h2>
        <p className="mt-2 text-sm text-staff-muted">
          A River template that already exists on the destination Group is
          reused only when you confirm an exact match. Incompatible guides are
          blocked. There is no override.
        </p>
        {move && move.canonicalDecisions.length > 0 ? (
          <CanonicalRetargetForm
            sourceClinicId={clinic.id}
            preparationId={preparation.id}
            decisions={move.canonicalDecisions}
          />
        ) : (
          <p className="mt-3 text-sm">No canonical guide needs a decision.</p>
        )}
      </section>

      <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
        <h2 className="text-base font-semibold">Staff</h2>
        <p className="mt-2 text-sm text-staff-muted">
          Each person stays on the source Account or moves to the destination
          Account. One person cannot be active in both. The destination Group
          keeps its own members. Pending invitations stay on the source.
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
        <h2 className="text-base font-semibold">Review</h2>
        {preview.destinationPreview.publicUrlStatement ===
        PUBLIC_URLS_UNCHANGED_STATEMENT ? (
          <p className="mt-3 text-sm font-medium">
            {PUBLIC_URLS_UNCHANGED_STATEMENT}
          </p>
        ) : null}
        <h3 className="mt-4 text-sm font-semibold">Blockers</h3>
        {preview.blockers.length > 0 ? (
          <ul className="mt-2 list-disc pl-5 text-sm">
            {preview.blockers.map((blocker) => (
              <li key={`${blocker.code}:${blocker.message}`}>
                {blocker.message}
              </li>
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
        <p className="mt-4 text-sm text-staff-muted">
          Branding storage is prepared before the move. Colours and typeface
          stay on the Clinic Site. This does not change either subscription.
        </p>
        {preview.status === "READY_TO_EXECUTE" && preview.confirmationPhrase ? (
          <div className="mt-4 rounded-lg border border-staff-line p-4">
            <h3 className="text-sm font-semibold">Move this Clinic Site</h3>
            <ul className="mt-2 list-disc pl-5 text-sm">
              <li>
                Move {movingSite?.displayName ?? "the selected Clinic Site"}
              </li>
              <li>Keep public URLs</li>
              <li>
                Copy {move?.guidesToCopy ?? 0} guide
                {(move?.guidesToCopy ?? 0) === 1 ? "" : "s"}
              </li>
              <li>Leave both subscriptions unchanged</li>
            </ul>
            <ExecuteSplitForm
              sourceClinicId={clinic.id}
              preparationId={preparation.id}
              preparationRevision={preparation.preparationRevision}
              confirmationPhrase={preview.confirmationPhrase}
              submitLabel="Move site"
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
              />
            ) : null}
            <p className="mt-4 text-sm text-staff-muted">
              Execution stays closed until this preparation is ready. The
              confirmation will be{" "}
              <span className="font-mono">
                {preparation.expectedConfirmation ??
                  preview.confirmationPhrase ??
                  "move site {siteSlug}"}
              </span>
              .
            </p>
          </>
        )}
        {preparation.status !== "COMPLETED" &&
        preparation.status !== "CANCELLED" ? (
          <CancelSplitPreparationForm
            sourceClinicId={clinic.id}
            preparationId={preparation.id}
          />
        ) : null}
        {completed ? (
          <p className="mt-4 text-sm">
            Completed. Destination {completed.destination.name}. Moved Site{" "}
            {completed.movedSite.slug}.
          </p>
        ) : null}
        {cancelled?.destinationClinic ? (
          <p className="mt-4 text-sm">
            Cancelled. Destination {cancelled.destinationClinic.name} was not
            changed by a move.
          </p>
        ) : null}
      </section>

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
