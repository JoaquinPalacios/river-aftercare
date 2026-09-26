"use client";

import { useActionState, useState } from "react";

import {
  createSiteAction,
  type SiteActionState,
} from "@/app/(staff)/(clinic-portal)/practice/sites/actions";
import {
  suggestLocationSlug,
  suggestSiteSlug,
} from "@/lib/clinics/slug-suggestion";

const initial: SiteActionState = {};

export function CreateSiteForm() {
  const [state, action, pending] = useActionState(createSiteAction, initial);
  const [siteName, setSiteName] = useState("");
  const [siteSlug, setSiteSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [locationName, setLocationName] = useState("");

  return (
    <form
      action={action}
      className="grid gap-4 rounded-xl border border-staff-line bg-staff-panel p-5"
    >
      <h2 className="text-base font-semibold">Add a clinic site</h2>
      <p className="text-sm text-staff-muted">
        A new site starts with its own root location. The site address cannot be
        changed after creation.
      </p>
      <label className="grid gap-1 text-sm" htmlFor="siteName">
        Site name
        <input
          id="siteName"
          name="siteName"
          value={siteName}
          onChange={(event) => {
            const next = event.target.value;
            setSiteName(next);
            if (!slugEdited) {
              setSiteSlug(suggestSiteSlug(next));
            }
          }}
          className="staffField"
          required
        />
      </label>
      <label className="grid gap-1 text-sm" htmlFor="siteSlug">
        Site address
        <input
          id="siteSlug"
          name="siteSlug"
          value={siteSlug}
          onChange={(event) => {
            setSlugEdited(true);
            setSiteSlug(event.target.value);
          }}
          className="staffField"
          required
          autoCapitalize="none"
          spellCheck={false}
        />
      </label>
      <label className="grid gap-1 text-sm" htmlFor="locationName">
        First location name
        <input
          id="locationName"
          name="locationName"
          value={locationName}
          onChange={(event) => setLocationName(event.target.value)}
          className="staffField"
          required
        />
      </label>
      <input type="hidden" name="locationDisplayName" value={locationName} />
      <LocationFields idPrefix="new-site" />
      {state.error ? (
        <p className="text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.fieldErrors
        ? Object.entries(state.fieldErrors).map(([field, message]) => (
            <p key={field} className="text-sm text-red-700" role="alert">
              {message}
            </p>
          ))
        : null}
      {state.saved ? (
        <p className="text-sm text-staff-muted" role="status">
          Clinic site created.
        </p>
      ) : null}
      <button
        type="submit"
        className="staffBtn staffBtnPrimary w-fit"
        disabled={pending}
      >
        {pending ? "Creating…" : "Create site"}
      </button>
      <p className="sr-only">
        Suggested location address {suggestLocationSlug(locationName)}
      </p>
    </form>
  );
}

export function LocationFields({
  idPrefix,
  values,
}: {
  idPrefix: string;
  values?: Partial<Record<string, string | null>>;
}) {
  const fields = [
    { name: "phone", label: "Phone", type: "tel", autoComplete: "tel" },
    { name: "addressLine1", label: "Address line 1" },
    { name: "addressLine2", label: "Address line 2" },
    { name: "city", label: "City" },
    { name: "region", label: "Region" },
    { name: "postalCode", label: "Postal code" },
    { name: "country", label: "Country" },
    {
      name: "contactUrl",
      label: "Contact URL",
      type: "url",
      autoComplete: "url",
    },
    {
      name: "contactEmail",
      label: "Contact email",
      type: "email",
      autoComplete: "email",
    },
    {
      name: "bookingUrl",
      label: "Booking URL",
      type: "url",
      autoComplete: "url",
    },
  ] as const;
  return (
    <>
      {fields.map((field) => (
        <label
          key={field.name}
          className="grid gap-1 text-sm"
          htmlFor={`${idPrefix}-${field.name}`}
        >
          {field.label}
          <input
            id={`${idPrefix}-${field.name}`}
            name={field.name}
            type={"type" in field ? field.type : "text"}
            autoComplete={
              "autoComplete" in field ? field.autoComplete : undefined
            }
            inputMode={
              "type" in field && (field.type === "tel" || field.type === "url")
                ? field.type
                : undefined
            }
            spellCheck={
              "type" in field &&
              (field.type === "url" || field.type === "email")
                ? false
                : undefined
            }
            defaultValue={values?.[field.name] ?? ""}
            className="staffField"
          />
        </label>
      ))}
      <label className="grid gap-1 text-sm" htmlFor={`${idPrefix}-emergency`}>
        Emergency instructions
        <textarea
          id={`${idPrefix}-emergency`}
          name="emergencyInstructions"
          defaultValue={values?.emergencyInstructions ?? ""}
          className="staffField min-h-24"
        />
      </label>
    </>
  );
}
