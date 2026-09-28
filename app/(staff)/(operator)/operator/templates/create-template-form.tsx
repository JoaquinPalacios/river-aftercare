"use client";

import { useActionState, useState } from "react";

import {
  createCanonicalTemplateAction,
  type CanonicalTemplateActionState,
} from "@/app/(staff)/(operator)/operator/templates/actions";
import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
} from "@/lib/aftercare/service-category";
import { suggestGuideSlug } from "@/lib/clinics/slug-suggestion";

const initial: CanonicalTemplateActionState = {};

export function CreateTemplateForm() {
  const [state, action, pending] = useActionState(
    createCanonicalTemplateAction,
    initial
  );
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  function updateTitle(next: string) {
    setTitle(next);
    if (!slugEdited) {
      setSlug(suggestGuideSlug(next));
    }
  }

  function updateSlug(next: string) {
    setSlugEdited(true);
    setSlug(next);
  }

  function regenerateSlug() {
    setSlugEdited(false);
    setSlug(suggestGuideSlug(title));
  }

  return (
    <form action={action} className="flex max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="title">
          Title
        </label>
        <input
          id="title"
          name="title"
          required
          value={title}
          onChange={(event) => updateTitle(event.target.value)}
          className="staffField"
          aria-invalid={state.fieldErrors?.title ? true : undefined}
        />
        {state.fieldErrors?.title ? (
          <p className="text-sm text-red-600">{state.fieldErrors.title}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="slug">
          Slug
        </label>
        <input
          id="slug"
          name="slug"
          required
          value={slug}
          onChange={(event) => updateSlug(event.target.value)}
          className="staffField staffFieldNarrow"
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={state.fieldErrors?.slug ? true : undefined}
          aria-describedby="slug-hint"
        />
        {slugEdited ? (
          <button
            type="button"
            className="staffBtn staffBtnQuiet w-fit"
            onClick={regenerateSlug}
          >
            Regenerate from title
          </button>
        ) : null}
        <p id="slug-hint" className="text-sm text-staff-muted">
          Generated from the title until you edit it. The slug stays editable
          until the first publication. The slug extraction is reserved for the
          demo sample.
        </p>
        {state.fieldErrors?.slug ? (
          <p className="text-sm text-red-600">{state.fieldErrors.slug}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="serviceCategory">
          Service category
        </label>
        <select
          id="serviceCategory"
          name="serviceCategory"
          required
          defaultValue=""
          className="staffSelect"
          aria-invalid={state.fieldErrors?.serviceCategory ? true : undefined}
        >
          <option value="" disabled>
            Choose a category
          </option>
          {SERVICE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {SERVICE_CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
        {state.fieldErrors?.serviceCategory ? (
          <p className="text-sm text-red-600">
            {state.fieldErrors.serviceCategory}
          </p>
        ) : null}
      </div>
      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        className="staffBtn staffBtnPrimary w-fit"
        disabled={pending}
      >
        {pending ? "Creating…" : "Create template"}
      </button>
    </form>
  );
}
