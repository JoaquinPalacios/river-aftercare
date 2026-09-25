"use client";

import { useActionState, useRef, useState } from "react";

import { ConfirmDialog } from "@/app/(staff)/components/confirm-dialog";
import {
  PracticeDarkLogoField,
  PracticeFaviconField,
  PracticeLogoField,
} from "@/app/(staff)/(clinic-portal)/practice/practice-logo-field";
import {
  createLocationAction,
  saveSiteBrandingAction,
  setLocationActiveAction,
  updateLocationAction,
  type SiteActionState,
} from "@/app/(staff)/(clinic-portal)/practice/sites/actions";
import { LocationFields } from "@/app/(staff)/(clinic-portal)/practice/sites/create-site-form";
import { CLINIC_TYPEFACE_OPTIONS } from "@/lib/branding/clinic-typeface";
import { INSTRUCTION_TERMINOLOGY } from "@/lib/aftercare/instruction-terminology";
import { suggestLocationSlug } from "@/lib/clinics/slug-suggestion";

type LocationRow = {
  id: string;
  name: string;
  displayName: string;
  slug: string | null;
  active: boolean;
  servesSiteRoot: boolean;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  contactUrl: string | null;
  contactEmail: string | null;
  bookingUrl: string | null;
  emergencyInstructions: string | null;
};

type SiteRow = {
  id: string;
  name: string;
  slug: string;
  displayName: string;
  active: boolean;
  logoUrl: string | null;
  darkLogoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  darkPrimaryColor: string | null;
  darkAccentColor: string | null;
  useCustomDarkBranding: boolean;
  neutralColor: string | null;
  radiusPreset: string;
  typeface: string | null;
  instructionTerminology: string;
  themeMode: string;
  allowPatientThemeToggle: boolean;
  showCareGuideAttribution: boolean;
  locations: LocationRow[];
};

const initial: SiteActionState = {};

export function SiteManager({
  site,
  canManage,
  canAddLocation,
  storageAvailable,
  logoSrc,
  darkLogoSrc,
  faviconSrc,
  rootDomain,
}: {
  site: SiteRow;
  canManage: boolean;
  canAddLocation: boolean;
  storageAvailable: boolean;
  logoSrc: string | null;
  darkLogoSrc: string | null;
  faviconSrc: string | null;
  rootDomain: string;
}) {
  return (
    <>
      <BrandingForm
        site={site}
        canManage={canManage}
        storageAvailable={storageAvailable}
        logoSrc={logoSrc}
        darkLogoSrc={darkLogoSrc}
        faviconSrc={faviconSrc}
        rootDomain={rootDomain}
      />
      <section className="rounded-xl border border-staff-line bg-staff-panel p-5">
        <h2 className="text-base font-semibold">Locations</h2>
        <ul className="mt-4 flex flex-col gap-4">
          {site.locations.map((location) => (
            <li key={location.id}>
              <LocationEditor
                siteId={site.id}
                location={location}
                canManage={canManage}
                rootDomain={rootDomain}
                siteSlug={site.slug}
              />
            </li>
          ))}
        </ul>
        {canAddLocation ? <AddLocationForm siteId={site.id} /> : null}
      </section>
    </>
  );
}

function BrandingForm({
  site,
  canManage,
  storageAvailable,
  logoSrc,
  darkLogoSrc,
  faviconSrc,
}: {
  site: SiteRow;
  canManage: boolean;
  storageAvailable: boolean;
  logoSrc: string | null;
  darkLogoSrc: string | null;
  faviconSrc: string | null;
  rootDomain: string;
}) {
  const [state, action, pending] = useActionState(
    saveSiteBrandingAction,
    initial
  );
  const [logo, setLogo] = useState({
    logoUrl: site.logoUrl,
    logoSrc,
  });
  const [darkLogo, setDarkLogo] = useState({
    logoUrl: site.darkLogoUrl,
    logoSrc: darkLogoSrc,
  });
  const [favicon, setFavicon] = useState({
    faviconUrl: site.faviconUrl,
    faviconSrc,
  });

  return (
    <form
      action={action}
      className="grid gap-4 rounded-xl border border-staff-line bg-staff-panel p-5"
    >
      <h2 className="text-base font-semibold">Branding</h2>
      <input type="hidden" name="siteId" value={site.id} />
      <input type="hidden" name="logoUrl" value={logo.logoUrl ?? ""} />
      <input type="hidden" name="darkLogoUrl" value={darkLogo.logoUrl ?? ""} />
      <input type="hidden" name="faviconUrl" value={favicon.faviconUrl ?? ""} />
      <label className="grid gap-1 text-sm" htmlFor="site-name">
        Site name
        <input
          id="site-name"
          name="name"
          defaultValue={site.name}
          className="staffField"
          disabled={!canManage}
        />
      </label>
      <label className="grid gap-1 text-sm" htmlFor="displayName">
        Display name
        <input
          id="displayName"
          name="displayName"
          defaultValue={site.displayName}
          className="staffField"
          disabled={!canManage}
        />
      </label>
      <p className="text-sm text-staff-muted">
        Address: {site.slug}. It is not editable.
      </p>
      {canManage ? (
        <>
          <PracticeLogoField
            displayName={site.displayName}
            logoUrl={logo.logoUrl}
            logoSrc={logo.logoSrc}
            canEdit
            storageAvailable={storageAvailable}
            siteId={site.id}
            onLogoChange={setLogo}
          />
          <PracticeDarkLogoField
            displayName={site.displayName}
            logoUrl={darkLogo.logoUrl}
            logoSrc={darkLogo.logoSrc}
            canEdit
            storageAvailable={storageAvailable}
            siteId={site.id}
            onLogoChange={setDarkLogo}
          />
          <PracticeFaviconField
            displayName={site.displayName}
            faviconUrl={favicon.faviconUrl}
            faviconSrc={favicon.faviconSrc}
            canEdit
            storageAvailable={storageAvailable}
            siteId={site.id}
            onFaviconChange={setFavicon}
          />
        </>
      ) : null}
      <ColorInput
        id="primaryColor"
        name="primaryColor"
        label="Primary colour"
        defaultValue={site.primaryColor}
        disabled={!canManage}
      />
      <ColorInput
        id="accentColor"
        name="accentColor"
        label="Accent colour"
        defaultValue={site.accentColor}
        disabled={!canManage}
      />
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="useCustomDarkBranding"
          defaultChecked={site.useCustomDarkBranding}
          disabled={!canManage}
        />
        <span>Use custom Dark branding</span>
      </label>
      <ColorInput
        id="darkPrimaryColor"
        name="darkPrimaryColor"
        label="Dark primary colour"
        defaultValue={site.darkPrimaryColor}
        disabled={!canManage}
      />
      <ColorInput
        id="darkAccentColor"
        name="darkAccentColor"
        label="Dark accent colour"
        defaultValue={site.darkAccentColor}
        disabled={!canManage}
      />
      <ColorInput
        id="neutralColor"
        name="neutralColor"
        label="Neutral colour"
        defaultValue={site.neutralColor}
        disabled={!canManage}
      />
      <label className="grid gap-1 text-sm" htmlFor="radiusPreset">
        Corner radius
        <select
          id="radiusPreset"
          name="radiusPreset"
          defaultValue={site.radiusPreset}
          className="staffSelect"
          disabled={!canManage}
        >
          <option value="SHARP">Sharp</option>
          <option value="MEDIUM">Medium</option>
          <option value="SOFT">Soft</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm" htmlFor="typeface">
        Typeface
        <select
          id="typeface"
          name="typeface"
          defaultValue={site.typeface ?? ""}
          className="staffSelect"
          disabled={!canManage}
        >
          <option value="">River Aftercare default</option>
          {CLINIC_TYPEFACE_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm" htmlFor="instructionTerminology">
        Terminology
        <select
          id="instructionTerminology"
          name="instructionTerminology"
          defaultValue={site.instructionTerminology}
          className="staffSelect"
          disabled={!canManage}
        >
          {INSTRUCTION_TERMINOLOGY.map((term) => (
            <option key={term} value={term}>
              {term}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm" htmlFor="themeMode">
        Theme
        <select
          id="themeMode"
          name="themeMode"
          defaultValue={site.themeMode}
          className="staffSelect"
          disabled={!canManage}
        >
          <option value="SYSTEM">System</option>
          <option value="LIGHT">Light</option>
          <option value="DARK">Dark</option>
        </select>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="allowPatientThemeToggle"
          defaultChecked={site.allowPatientThemeToggle}
          disabled={!canManage}
        />
        <span>Allow patients to change theme</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="showCareGuideAttribution"
          defaultChecked={site.showCareGuideAttribution}
          disabled={!canManage}
        />
        <span>Show River Aftercare attribution</span>
      </label>
      {state.error ? (
        <p className="text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p className="text-sm text-staff-muted" role="status">
          Site branding saved.
        </p>
      ) : null}
      {canManage ? (
        <button
          type="submit"
          className="staffBtn staffBtnPrimary w-fit"
          disabled={pending}
        >
          {pending ? "Saving…" : "Save branding"}
        </button>
      ) : null}
    </form>
  );
}

function ColorInput({
  id,
  name,
  label,
  defaultValue,
  disabled,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string | null;
  disabled: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm" htmlFor={id}>
      {label}
      <input
        id={id}
        name={name}
        defaultValue={defaultValue ?? ""}
        className="staffField"
        disabled={disabled}
      />
    </label>
  );
}

function LocationEditor({
  siteId,
  location,
  canManage,
  rootDomain,
  siteSlug,
}: {
  siteId: string;
  location: LocationRow;
  canManage: boolean;
  rootDomain: string;
  siteSlug: string;
}) {
  const [state, action, pending] = useActionState(
    updateLocationAction,
    initial
  );
  const [statusState, statusAction, statusPending] = useActionState(
    setLocationActiveAction,
    initial
  );
  const [confirm, setConfirm] = useState(false);
  const statusFormRef = useRef<HTMLFormElement>(null);
  const path = location.servesSiteRoot
    ? `${siteSlug}.${rootDomain}`
    : `${siteSlug}.${rootDomain}/${location.slug}`;

  return (
    <div className="rounded-lg border border-staff-line p-4">
      <p className="text-sm font-medium">{location.name}</p>
      <p className="text-sm text-staff-muted">
        {path} · {location.active ? "Active" : "Inactive"}
        {location.servesSiteRoot ? " · site root" : ""}
      </p>
      <form action={action} className="mt-3 grid gap-3">
        <input type="hidden" name="siteId" value={siteId} />
        <input type="hidden" name="locationId" value={location.id} />
        <label className="grid gap-1 text-sm" htmlFor={`name-${location.id}`}>
          Location name
          <input
            id={`name-${location.id}`}
            name="name"
            defaultValue={location.name}
            className="staffField"
            disabled={!canManage}
          />
        </label>
        <label
          className="grid gap-1 text-sm"
          htmlFor={`display-${location.id}`}
        >
          Display name
          <input
            id={`display-${location.id}`}
            name="displayName"
            defaultValue={location.displayName}
            className="staffField"
            disabled={!canManage}
          />
        </label>
        <LocationFields
          idPrefix={location.id}
          values={{
            phone: location.phone,
            addressLine1: location.addressLine1,
            addressLine2: location.addressLine2,
            city: location.city,
            region: location.region,
            postalCode: location.postalCode,
            country: location.country,
            contactUrl: location.contactUrl,
            contactEmail: location.contactEmail,
            bookingUrl: location.bookingUrl,
            emergencyInstructions: location.emergencyInstructions,
          }}
        />
        {state.error ? (
          <p className="text-sm text-red-700" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.saved ? (
          <p className="text-sm text-staff-muted" role="status">
            Location saved.
          </p>
        ) : null}
        {canManage ? (
          <button
            type="submit"
            className="staffBtn staffBtnSecondary w-fit"
            disabled={pending}
          >
            {pending ? "Saving…" : "Save location"}
          </button>
        ) : null}
      </form>
      {canManage && !location.servesSiteRoot ? (
        <form ref={statusFormRef} action={statusAction} className="mt-3">
          <input type="hidden" name="siteId" value={siteId} />
          <input type="hidden" name="locationId" value={location.id} />
          <input
            type="hidden"
            name="active"
            value={location.active ? "false" : "true"}
          />
          <button
            type="button"
            className="staffBtn staffBtnQuiet"
            onClick={() => setConfirm(true)}
          >
            {location.active ? "Deactivate location" : "Reactivate location"}
          </button>
          {statusState.error ? (
            <p className="mt-2 text-sm text-red-700" role="alert">
              {statusState.error}
            </p>
          ) : null}
          <ConfirmDialog
            open={confirm}
            title={
              location.active
                ? `Deactivate ${location.name}?`
                : `Reactivate ${location.name}?`
            }
            description={
              location.active
                ? "Public pages for this location stop resolving. The address and guide placements stay stored."
                : "Reactivation uses one active location place if the account has room."
            }
            cancelLabel="Cancel"
            confirmLabel={location.active ? "Deactivate" : "Reactivate"}
            confirmTone={location.active ? "danger" : "primary"}
            pending={statusPending}
            onCancel={() => setConfirm(false)}
            onConfirm={() => {
              setConfirm(false);
              statusFormRef.current?.requestSubmit();
            }}
          />
        </form>
      ) : null}
    </div>
  );
}

function AddLocationForm({ siteId }: { siteId: string }) {
  const [state, action, pending] = useActionState(
    createLocationAction,
    initial
  );
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [edited, setEdited] = useState(false);
  return (
    <form
      action={action}
      className="mt-6 grid gap-3 border-t border-staff-line pt-4"
    >
      <h3 className="text-sm font-semibold">Add a location</h3>
      <input type="hidden" name="siteId" value={siteId} />
      <label className="grid gap-1 text-sm" htmlFor="new-location-name">
        Location name
        <input
          id="new-location-name"
          name="name"
          value={name}
          onChange={(event) => {
            const next = event.target.value;
            setName(next);
            if (!edited) setSlug(suggestLocationSlug(next));
          }}
          className="staffField"
          required
        />
      </label>
      <label className="grid gap-1 text-sm" htmlFor="new-location-display">
        Display name
        <input
          id="new-location-display"
          name="displayName"
          defaultValue=""
          placeholder={name}
          className="staffField"
          required
        />
      </label>
      <label className="grid gap-1 text-sm" htmlFor="new-location-slug">
        Location address
        <input
          id="new-location-slug"
          name="slug"
          value={slug}
          onChange={(event) => {
            setEdited(true);
            setSlug(event.target.value);
          }}
          className="staffField"
          required
          autoCapitalize="none"
          spellCheck={false}
        />
      </label>
      <LocationFields idPrefix="new-location" />
      {state.error ? (
        <p className="text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        className="staffBtn staffBtnPrimary w-fit"
        disabled={pending}
      >
        {pending ? "Adding…" : "Add location"}
      </button>
    </form>
  );
}
