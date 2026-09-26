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
import { groupEffectiveAllowances } from "@/lib/clinics/group-capacity";
import { parseOperatorExtraAllowance } from "@/lib/entitlements/allowance-input";

const initialState: SiteCapacityActionState = {};

export function SiteLocationCapacityForm({
  clinicId,
  plan,
  siteAllowance,
  locationAllowance,
  activeSites,
  activeLocations,
  sites,
  groupCapacity,
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
  groupCapacity: {
    configured: boolean;
    commerciallyActive: boolean;
    purchasedAdditionalSiteQuantity: number | null;
    extraSiteAllowance: number;
    extraLocationAllowance: number;
  } | null;
}) {
  const [state, action, pending] = useActionState(
    updateSiteLocationAllowanceAction,
    initialState
  );
  const [sitesValue, setSitesValue] = useState(
    String(groupCapacity?.extraSiteAllowance ?? siteAllowance)
  );
  const [locationsValue, setLocationsValue] = useState(
    String(groupCapacity?.extraLocationAllowance ?? locationAllowance)
  );
  const siteLocked = plan !== "GROUP";
  const locationLocked = plan !== "GROUP" && plan !== "PRACTICE";
  const paidAdditionalSites =
    groupCapacity?.purchasedAdditionalSiteQuantity ?? 0;
  const extraSites = parseOperatorExtraAllowance(sitesValue);
  const extraLocations = parseOperatorExtraAllowance(locationsValue);
  const groupPreview =
    plan === "GROUP" && extraSites !== null && extraLocations !== null
      ? groupEffectiveAllowances({
          purchasedAdditionalSiteQuantity: paidAdditionalSites,
          extraSiteAllowance: extraSites,
          extraLocationAllowance: extraLocations,
        })
      : null;

  return (
    <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
      <h2 className="text-base font-semibold">Sites and locations</h2>
      <p className="mt-2 text-sm text-staff-muted">
        {planLabel(plan)}. Active sites {activeSites} / {siteAllowance}. Active
        locations {activeLocations} / {locationAllowance}.
      </p>
      {plan === "GROUP" && groupCapacity ? (
        <GroupCapacityFields
          clinicId={clinicId}
          action={action}
          pending={pending}
          state={state}
          configured={groupCapacity.configured}
          commerciallyActive={groupCapacity.commerciallyActive}
          purchasedAdditionalSiteQuantity={
            groupCapacity.purchasedAdditionalSiteQuantity
          }
          sitesValue={sitesValue}
          locationsValue={locationsValue}
          setSitesValue={setSitesValue}
          setLocationsValue={setLocationsValue}
          preview={groupPreview}
          siteAllowance={siteAllowance}
          locationAllowance={locationAllowance}
          activeSites={activeSites}
          activeLocations={activeLocations}
        />
      ) : (
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
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="staffBtn staffBtnPrimary"
              disabled={pending}
            >
              {pending ? "Saving…" : "Save capacity"}
            </button>
          </div>
          <CapacityMessages state={state} />
          <p className="text-sm text-staff-muted sm:col-span-2">
            Changing these allowances does not charge or refund the customer.
          </p>
        </form>
      )}
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

function CapacityMessages({ state }: { state: SiteCapacityActionState }) {
  return (
    <>
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
    </>
  );
}

function GroupCapacityFields({
  clinicId,
  action,
  pending,
  state,
  configured,
  commerciallyActive,
  purchasedAdditionalSiteQuantity,
  sitesValue,
  locationsValue,
  setSitesValue,
  setLocationsValue,
  preview,
  siteAllowance,
  locationAllowance,
  activeSites,
  activeLocations,
}: {
  clinicId: string;
  action: (formData: FormData) => void;
  pending: boolean;
  state: SiteCapacityActionState;
  configured: boolean;
  commerciallyActive: boolean;
  purchasedAdditionalSiteQuantity: number | null;
  sitesValue: string;
  locationsValue: string;
  setSitesValue: (value: string) => void;
  setLocationsValue: (value: string) => void;
  preview: { siteAllowance: number; locationAllowance: number } | null;
  siteAllowance: number;
  locationAllowance: number;
  activeSites: number;
  activeLocations: number;
}) {
  const enforcedSites = commerciallyActive
    ? (preview?.siteAllowance ?? siteAllowance)
    : siteAllowance;
  const enforcedLocations = commerciallyActive
    ? (preview?.locationAllowance ?? locationAllowance)
    : locationAllowance;
  const overSites = activeSites > enforcedSites;
  const overLocations = activeLocations > enforcedLocations;
  return (
    <form action={action} className="mt-4 grid gap-3">
      <input type="hidden" name="clinicId" value={clinicId} />
      <input type="hidden" name="capacityKind" value="group-extras" />
      <p className="text-sm text-staff-muted">
        Included Group capacity is {GROUP_BASE_SITE_ALLOWANCE} Clinic Sites and{" "}
        {GROUP_BASE_LOCATION_ALLOWANCE} Locations. Each paid Additional Site
        bundle will add one Clinic Site and one Location. Those paid bundles
        will be managed through Group billing later. They are not edited here.
      </p>
      <p className="text-sm text-staff-muted">
        Complimentary extras are manual allowances. They do not charge or refund
        the customer. Effective totals are derived from the included capacity,
        the recorded paid quantity, and these extras.
      </p>
      <p className="text-sm">
        Paid Additional Site bundles:{" "}
        {purchasedAdditionalSiteQuantity === null
          ? "Not recorded yet"
          : purchasedAdditionalSiteQuantity}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm" htmlFor="extraSiteAllowance">
          Complimentary extra Clinic Sites
          <input
            id="extraSiteAllowance"
            name="extraSiteAllowance"
            inputMode="numeric"
            value={sitesValue}
            onChange={(event) => setSitesValue(event.target.value)}
            className="staffField"
          />
        </label>
        <label className="grid gap-1 text-sm" htmlFor="extraLocationAllowance">
          Complimentary extra Locations
          <input
            id="extraLocationAllowance"
            name="extraLocationAllowance"
            inputMode="numeric"
            value={locationsValue}
            onChange={(event) => setLocationsValue(event.target.value)}
            className="staffField"
          />
        </label>
      </div>
      {preview && commerciallyActive ? (
        <p className="text-sm">
          Effective capacity after save: {preview.siteAllowance} Clinic Sites /{" "}
          {preview.locationAllowance} Locations.
        </p>
      ) : preview ? (
        <p className="text-sm">
          Effective capacity stays {siteAllowance} Clinic Sites /{" "}
          {locationAllowance} Locations until the entitlement is active. Once
          active, derived capacity is {preview.siteAllowance} Clinic Sites /{" "}
          {preview.locationAllowance} Locations.
        </p>
      ) : (
        <p className="text-sm text-red-700" role="alert">
          Enter a whole number of zero or more for each complimentary extra.
        </p>
      )}
      {!configured ? (
        <p className="text-sm text-staff-muted">
          Saving configures this Group account. Previously stored site and
          location totals are not added on top of the included capacity.
        </p>
      ) : null}
      {!commerciallyActive ? (
        <p className="text-sm text-staff-muted">
          This entitlement is not active. Saving records the complimentary
          extras and does not grant Group capacity.
        </p>
      ) : null}
      {overSites || overLocations ? (
        <p className="text-sm text-staff-muted">
          Usage is above the effective allowance after this save. Existing sites
          and locations stay. Nothing is deactivated.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="staffBtn staffBtnPrimary"
          disabled={pending || preview === null}
        >
          {pending ? "Saving…" : "Save complimentary capacity"}
        </button>
        <button
          type="button"
          className="staffBtn staffBtnSecondary"
          onClick={() => {
            setSitesValue("0");
            setLocationsValue("0");
          }}
        >
          Clear complimentary extras
        </button>
      </div>
      <CapacityMessages state={state} />
    </form>
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
