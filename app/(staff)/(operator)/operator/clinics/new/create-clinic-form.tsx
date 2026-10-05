"use client";

import { useActionState, useState } from "react";

import {
  createClinicAction,
  type OperatorActionState,
} from "@/app/(staff)/(operator)/operator/actions";
import { ServiceCategoryFields } from "@/app/(staff)/(clinic-portal)/practice/sites/service-category-fields";
import { suggestGuideSlug } from "@/lib/clinics/slug-suggestion";

const initial: OperatorActionState = {};

export function CreateClinicForm() {
  const [state, action, pending] = useActionState(createClinicAction, initial);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  function updateName(next: string) {
    setName(next);
    if (!slugEdited) {
      setSlug(suggestGuideSlug(next));
    }
  }

  function updateSlug(next: string) {
    setSlugEdited(true);
    setSlug(next);
  }

  return (
    <form action={action} className="flex max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="name">
          Practice name
        </label>
        <input
          id="name"
          name="name"
          required
          value={name}
          onChange={(event) => updateName(event.target.value)}
          className="h-11 rounded-md border border-staff-line bg-staff-panel px-3 text-sm"
          aria-invalid={state.fieldErrors?.name ? true : undefined}
          aria-describedby={state.fieldErrors?.name ? "name-error" : undefined}
        />
        {state.fieldErrors?.name ? (
          <p id="name-error" className="text-sm text-red-600" role="alert">
            {state.fieldErrors.name}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="slug">
          Tenant slug
        </label>
        <input
          id="slug"
          name="slug"
          required
          value={slug}
          onChange={(event) => updateSlug(event.target.value)}
          placeholder="riverside-dental"
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          className="h-11 rounded-md border border-staff-line bg-staff-panel px-3 text-sm"
          aria-invalid={state.fieldErrors?.slug ? true : undefined}
          aria-describedby={
            state.fieldErrors?.slug ? "slug-hint slug-error" : "slug-hint"
          }
        />
        <p id="slug-hint" className="text-sm text-staff-muted">
          Generated from the practice name until you edit it. Use lowercase
          letters, numbers, and hyphens.
        </p>
        {state.fieldErrors?.slug ? (
          <p id="slug-error" className="text-sm text-red-600" role="alert">
            {state.fieldErrors.slug}
          </p>
        ) : null}
      </div>
      <ServiceCategoryFields
        selected={[]}
        disabled={pending}
        legend="Practice categories"
        description="Choose every category this clinic provides. At least one is required. A multidisciplinary clinic can select more than one."
        error={state.fieldErrors?.serviceCategories}
      />
      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="staffBtn staffBtnPrimary w-fit"
      >
        {pending ? "Creating…" : "Create clinic"}
      </button>
      <p className="text-sm text-staff-muted">
        The next page sets commercial access and invites the first
        administrator. They choose their own password.
      </p>
    </form>
  );
}
