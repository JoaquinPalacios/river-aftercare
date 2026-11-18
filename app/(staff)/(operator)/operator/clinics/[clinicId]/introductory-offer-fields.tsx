"use client";

const COPY =
  "Optional private discount for a new Essential or Practice clinic. It is not shown on the public site. Monthly billing is 50% off for six or twelve paid months, then the catalogue price. Annual upfront billing is 25% off the first invoice for the six-month offer, or 50% off the first invoice for the twelve-month offer, then the catalogue annual price. This is not an annual commitment billed monthly. None withdraws an unredeemed discount. Group billing withdraws an unredeemed discount and cannot include one. A clinic can use one introductory offer.";

export function IntroductoryOfferFields({
  idPrefix,
  plan,
  defaultTerm = null,
  defaultExpiresOn = "",
  fieldErrors,
}: {
  idPrefix: string;
  plan: "ESSENTIAL" | "PRACTICE" | "GROUP";
  defaultTerm?: "SIX_MONTHS" | "TWELVE_MONTHS" | null;
  defaultExpiresOn?: string;
  fieldErrors?: Record<string, string>;
}) {
  const termId = `${idPrefix}-introductory-term`;
  const expiryId = `${idPrefix}-introductory-expiry`;
  if (plan === "GROUP") {
    return (
      <div className="flex flex-col gap-1.5">
        <input type="hidden" name="introductoryTerm" value="" />
        <p className="text-sm text-staff-muted">{COPY}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor={termId}>
          Introductory offer
        </label>
        <select
          id={termId}
          name="introductoryTerm"
          defaultValue={defaultTerm ?? ""}
          className="staffField staffSelect"
          aria-invalid={fieldErrors?.introductoryTerm ? "true" : "false"}
        >
          <option value="">None</option>
          <option value="SIX_MONTHS">Six-month offer</option>
          <option value="TWELVE_MONTHS">Twelve-month offer</option>
        </select>
        <p className="text-sm text-staff-muted">{COPY}</p>
        {fieldErrors?.introductoryTerm ? (
          <p className="text-sm text-red-600">{fieldErrors.introductoryTerm}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor={expiryId}>
          Offer expiry
        </label>
        <input
          id={expiryId}
          name="introductoryExpiresOn"
          type="date"
          defaultValue={defaultExpiresOn}
          className="staffField"
          aria-invalid={fieldErrors?.introductoryExpiresOn ? "true" : "false"}
        />
        <p className="text-sm text-staff-muted">
          Optional. The clinic can open Checkout through the end of this Sydney
          day. Leave it blank when the authorisation does not expire.
        </p>
        {fieldErrors?.introductoryExpiresOn ? (
          <p className="text-sm text-red-600">
            {fieldErrors.introductoryExpiresOn}
          </p>
        ) : null}
      </div>
    </div>
  );
}
