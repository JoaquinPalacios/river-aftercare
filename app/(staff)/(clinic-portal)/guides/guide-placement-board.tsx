"use client";

import { useActionState, useRef, useState } from "react";

import { ConfirmDialog } from "@/app/(staff)/components/confirm-dialog";
import {
  detachPlacementAction,
  setPlacementAvailabilityAction,
  useLatestPlacementAction,
  type PlacementActionState,
} from "@/app/(staff)/(clinic-portal)/guides/placement-actions";
import { guideQrDownloadPath } from "@/lib/clinic-portal/guide-qr";

const initial: PlacementActionState = {};

type LocationAvailability = {
  id: string;
  name: string;
  active: boolean;
  placementId: string | null;
  enabled: boolean;
  behind: boolean;
  publicUrl: string | null;
};

export function GuidePlacementBoard({
  guideId,
  canEdit,
  sites,
}: {
  guideId: string;
  canEdit: boolean;
  sites: Array<{
    id: string;
    name: string;
    active: boolean;
    locations: LocationAvailability[];
  }>;
}) {
  return (
    <section className="mx-auto mt-8 w-full min-w-0 max-w-5xl rounded-xl border border-staff-line bg-staff-panel p-5">
      <h2 className="text-base font-semibold">Available at</h2>
      <p className="mt-2 text-sm text-staff-muted">
        This guide stays in the account library. Each location has its own
        published version.
      </p>
      <div className="mt-4 flex flex-col gap-4">
        {sites.map((site) => (
          <fieldset key={site.id} className="grid gap-2">
            <legend className="text-sm font-medium">
              {site.name}
              {site.active ? "" : " · Inactive"}
            </legend>
            {site.locations.map((location) => (
              <LocationRow
                key={location.id}
                guideId={guideId}
                location={location}
                canEdit={canEdit}
              />
            ))}
          </fieldset>
        ))}
      </div>
    </section>
  );
}

function LocationRow({
  guideId,
  location,
  canEdit,
}: {
  guideId: string;
  location: LocationAvailability;
  canEdit: boolean;
}) {
  const [availability, setAvailability, availabilityPending] = useActionState(
    setPlacementAvailabilityAction,
    initial
  );
  const [latest, useLatest, latestPending] = useActionState(
    useLatestPlacementAction,
    initial
  );
  const [detached, detach, detachPending] = useActionState(
    detachPlacementAction,
    initial
  );
  const [confirmDetach, setConfirmDetach] = useState(false);
  const detachFormRef = useRef<HTMLFormElement>(null);
  const checked = location.enabled;
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <form action={setAvailability}>
        <input type="hidden" name="guideId" value={guideId} />
        <input type="hidden" name="locationId" value={location.id} />
        <input
          type="hidden"
          name="available"
          value={checked ? "false" : "true"}
        />
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={checked}
            disabled={!canEdit || !location.active || availabilityPending}
            onChange={(event) => {
              event.currentTarget.form?.requestSubmit();
            }}
            aria-label={`${checked ? "Remove from" : "Make available at"} ${location.name}`}
          />
          <span>
            {location.name}
            {location.active ? "" : " · Inactive"}
          </span>
        </label>
      </form>
      {location.behind ? (
        <span className="text-staff-muted">Update available</span>
      ) : null}
      {location.publicUrl ? (
        <a href={location.publicUrl} className="text-staff-brand">
          Open patient page
          <span className="sr-only"> for {location.name}</span>
        </a>
      ) : null}
      {location.placementId && location.publicUrl ? (
        <a
          href={`${guideQrDownloadPath(guideId, "svg")}&placementId=${location.placementId}`}
        >
          QR
          <span className="sr-only"> for {location.name}</span>
        </a>
      ) : null}
      {canEdit && location.behind && location.placementId ? (
        <form action={useLatest}>
          <input type="hidden" name="guideId" value={guideId} />
          <input
            type="hidden"
            name="placementId"
            value={location.placementId}
          />
          <button
            type="submit"
            className="staffBtn staffBtnQuiet"
            disabled={latestPending}
          >
            {latestPending ? "Updating…" : "Use latest version"}
          </button>
        </form>
      ) : null}
      {canEdit && location.placementId ? (
        <form ref={detachFormRef} action={detach}>
          <input
            type="hidden"
            name="placementId"
            value={location.placementId}
          />
          <button
            type="button"
            className="staffBtn staffBtnQuiet"
            onClick={() => setConfirmDetach(true)}
          >
            Create location-specific copy
          </button>
          <ConfirmDialog
            open={confirmDetach}
            title={`Create a copy for ${location.name}?`}
            description="This creates a new account guide for this location only. Other locations keep the original guide. The new guide counts toward the guide allowance."
            cancelLabel="Cancel"
            confirmLabel="Create copy"
            confirmTone="primary"
            pending={detachPending}
            onCancel={() => setConfirmDetach(false)}
            onConfirm={() => {
              setConfirmDetach(false);
              detachFormRef.current?.requestSubmit();
            }}
          />
        </form>
      ) : null}
      {availability.error ? (
        <p className="basis-full text-sm text-red-700" role="alert">
          {availability.error}
        </p>
      ) : null}
      {latest.error ? (
        <p className="basis-full text-sm text-red-700" role="alert">
          {latest.error}
        </p>
      ) : null}
      {detached.error ? (
        <p className="basis-full text-sm text-red-700" role="alert">
          {detached.error}
        </p>
      ) : null}
      {detached.guideId ? (
        <p className="basis-full text-sm" role="status">
          Location-specific copy created.{" "}
          <a
            className="text-staff-brand"
            href={`/guides/${detached.guideId}/edit`}
          >
            Edit the copy
          </a>
        </p>
      ) : null}
    </div>
  );
}
