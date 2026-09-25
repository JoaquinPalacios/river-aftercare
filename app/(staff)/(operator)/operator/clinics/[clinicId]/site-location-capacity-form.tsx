"use client";

import { useActionState, useRef, useState } from "react";

import { ConfirmDialog } from "@/app/(staff)/components/confirm-dialog";
import {
  setOperatorSiteActiveAction,
  updateSiteLocationAllowanceAction,
  type SiteCapacityActionState,
} from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/site-location-actions";
import {
  GROUP_BASE_LOCATION_ALLOWANCE,
  GROUP_BASE_SITE_ALLOWANCE,
} from "@/lib/clinics/site-location-allowance";

const initialState: SiteCapacityActionState = {};

export function SiteLocationCapacityForm({
  clinicId,
  plan,
  siteAllowance,
  locationAllowance,
  activeSites,
  activeLocations,
  sites,
}: {
  clinicId: string;
  plan: "ESSENTIAL" | "PRACTICE" | "GROUP" | null;
  siteAllowance: number;
  locationAllowance: number;
  activeSites: number;
  activeLocations: number;
  sites: Array<{
    id: string;
    name: string;
    slug: string;
    active: boolean;
    activeLocations: number;
  }>;
}) {
  const [state, action, pending] = useActionState(
    updateSiteLocationAllowanceAction,
    initialState
  );
  const groupDefaults =
    plan === "GROUP" && siteAllowance === 1 && locationAllowance === 1;
  const [sitesValue, setSitesValue] = useState(
    groupDefaults ? String(GROUP_BASE_SITE_ALLOWANCE) : String(siteAllowance)
  );
  const [locationsValue, setLocationsValue] = useState(
    groupDefaults
      ? String(GROUP_BASE_LOCATION_ALLOWANCE)
      : String(locationAllowance)
  );
  const siteLocked = plan !== "GROUP";
  const locationLocked = plan !== "GROUP" && plan !== "PRACTICE";

  return (
    <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
      <h2 className="text-base font-semibold">Sites and locations</h2>
      <p className="mt-2 text-sm text-staff-muted">
        {planLabel(plan)}. Active sites {activeSites} / {siteAllowance}. Active
        locations {activeLocations} / {locationAllowance}. Changing these
        allowances does not charge or refund the customer.
      </p>
      {plan === "GROUP" ? (
        <p className="mt-2 text-sm text-staff-muted">
          Group base is {GROUP_BASE_SITE_ALLOWANCE} sites and{" "}
          {GROUP_BASE_LOCATION_ALLOWANCE} locations. Each later site bundle adds
          one site and one location. Billing for that bundle is not automated.
        </p>
      ) : null}
      <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="clinicId" value={clinicId} />
        <label className="grid gap-1 text-sm" htmlFor="siteAllowance">
          Site allowance
          <input
            id="siteAllowance"
            name="siteAllowance"
            inputMode="numeric"
            value={siteLocked ? "1" : sitesValue}
            readOnly={siteLocked}
            onChange={(event) => setSitesValue(event.target.value)}
            className="staffField"
          />
        </label>
        <label className="grid gap-1 text-sm" htmlFor="locationAllowance">
          Location allowance
          <input
            id="locationAllowance"
            name="locationAllowance"
            inputMode="numeric"
            value={locationLocked ? "1" : locationsValue}
            readOnly={locationLocked}
            onChange={(event) => setLocationsValue(event.target.value)}
            className="staffField"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <button
            type="submit"
            className="staffBtn staffBtnPrimary"
            disabled={pending}
          >
            {pending ? "Saving…" : "Save capacity"}
          </button>
          {plan === "GROUP" ? (
            <button
              type="button"
              className="staffBtn staffBtnSecondary"
              onClick={() => {
                setSitesValue(String(GROUP_BASE_SITE_ALLOWANCE));
                setLocationsValue(String(GROUP_BASE_LOCATION_ALLOWANCE));
              }}
            >
              Use Group base ({GROUP_BASE_SITE_ALLOWANCE} /{" "}
              {GROUP_BASE_LOCATION_ALLOWANCE})
            </button>
          ) : null}
        </div>
        {state.error ? (
          <p className="text-sm text-red-700 sm:col-span-2" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p className="text-sm text-staff-muted sm:col-span-2" role="status">
            {state.success}
          </p>
        ) : null}
        {groupDefaults ? (
          <p className="text-sm text-staff-muted sm:col-span-2">
            Group base values are shown for a first save. They are not stored
            until you save capacity.
          </p>
        ) : null}
      </form>
      <ul className="mt-4 divide-y divide-staff-line">
        {sites.map((site) => (
          <li key={site.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{site.name}</p>
              <p className="text-sm text-staff-muted">
                {site.slug} · {site.active ? "Active" : "Inactive"} ·{" "}
                {site.activeLocations} active location
                {site.activeLocations === 1 ? "" : "s"}
              </p>
            </div>
            <SiteStatusControl
              clinicId={clinicId}
              siteId={site.id}
              active={site.active}
              siteName={site.name}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SiteStatusControl({
  clinicId,
  siteId,
  active,
  siteName,
}: {
  clinicId: string;
  siteId: string;
  active: boolean;
  siteName: string;
}) {
  const [state, action, pending] = useActionState(
    setOperatorSiteActiveAction,
    initialState
  );
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={action}>
      <input type="hidden" name="clinicId" value={clinicId} />
      <input type="hidden" name="siteId" value={siteId} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <button
        type="button"
        className="staffBtn staffBtnSecondary"
        onClick={() => setOpen(true)}
      >
        {active ? "Deactivate site" : "Reactivate site"}
      </button>
      {state.error ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="mt-2 text-sm text-staff-muted" role="status">
          {state.success}
        </p>
      ) : null}
      <ConfirmDialog
        open={open}
        title={active ? `Deactivate ${siteName}?` : `Reactivate ${siteName}?`}
        description={
          active
            ? "The site address will stop resolving. Locations, branding, and guide placements stay stored. This does not change billing."
            : "Reactivation checks site and location capacity. Locations are not deleted. This does not change billing."
        }
        cancelLabel="Cancel"
        confirmLabel={active ? "Deactivate site" : "Reactivate site"}
        confirmTone={active ? "danger" : "primary"}
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          formRef.current?.requestSubmit();
        }}
      />
    </form>
  );
}

function planLabel(plan: "ESSENTIAL" | "PRACTICE" | "GROUP" | null): string {
  if (plan === "ESSENTIAL") return "Essential";
  if (plan === "PRACTICE") return "Practice";
  if (plan === "GROUP") return "Group";
  return "No fixed plan";
}
