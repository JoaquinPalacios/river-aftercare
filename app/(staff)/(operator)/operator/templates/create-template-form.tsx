"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { UnsavedChangesDialog } from "@/app/(staff)/components/unsaved-changes-dialog";
import { useUnsavedChangesGuard } from "@/app/(staff)/components/use-unsaved-changes-guard";
import {
  createCanonicalTemplateAction,
  type CanonicalTemplateActionState,
} from "@/app/(staff)/(operator)/operator/templates/actions";
import { isValidCareGuideSlug } from "@/lib/aftercare/slug-rules";
import {
  isServiceCategory,
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
} from "@/lib/aftercare/service-category";
import { isReservedDemoCanonicalSlug } from "@/lib/canonical-templates/constants";
import { suggestGuideSlug } from "@/lib/clinics/slug-suggestion";

const initial: CanonicalTemplateActionState = {};
const blankSnapshot = JSON.stringify({
  title: "",
  slug: "",
  serviceCategory: "",
});

export function CreateTemplateForm() {
  const [state, action, pending] = useActionState(
    createCanonicalTemplateAction,
    initial
  );
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [serviceCategory, setServiceCategory] = useState("");
  const [leaving, setLeaving] = useState(false);
  const nextRef = useRef<HTMLInputElement>(null);
  const titleReady = title.trim().length > 0 && title.trim().length <= 120;
  const slugReady =
    isValidCareGuideSlug(slug) && !isReservedDemoCanonicalSlug(slug);
  const categoryReady = isServiceCategory(serviceCategory);
  const canCreate = titleReady && slugReady && categoryReady && !pending;
  const dirty =
    JSON.stringify({ title, slug, serviceCategory }) !== blankSnapshot;
  const {
    open: leaveOpen,
    href,
    keepEditing,
    discard,
    beginLeaving,
  } = useUnsavedChangesGuard(dirty);

  useEffect(() => {
    if (!leaving) {
      return;
    }
    if (state.error || state.fieldErrors) {
      setLeaving(false);
      keepEditing();
    }
  }, [state, leaving, keepEditing]);

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

  function saveAndLeave() {
    if (!canCreate) {
      return;
    }
    if (nextRef.current) {
      // Browser Back has no addressable href. An empty next keeps the
      // existing create redirect, which opens the new draft.
      nextRef.current.value = href ?? "";
    }
    beginLeaving();
    setLeaving(true);
    const form = document.getElementById(
      "create-template-form"
    ) as HTMLFormElement | null;
    form?.requestSubmit();
  }

  return (
    <form
      id="create-template-form"
      action={action}
      className="flex max-w-lg flex-col gap-4"
    >
      <input ref={nextRef} type="hidden" name="next" defaultValue="" />
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
          value={serviceCategory}
          className="staffSelect"
          aria-invalid={state.fieldErrors?.serviceCategory ? true : undefined}
          onChange={(event) => setServiceCategory(event.target.value)}
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
        disabled={!canCreate}
      >
        {pending ? "Creating…" : "Create template"}
      </button>
      <UnsavedChangesDialog
        open={leaveOpen}
        pending={leaving || pending}
        canSave={canCreate}
        saveDisabledReason="Complete the required fields before saving."
        onStay={keepEditing}
        onLeave={discard}
        onSave={saveAndLeave}
      />
    </form>
  );
}
