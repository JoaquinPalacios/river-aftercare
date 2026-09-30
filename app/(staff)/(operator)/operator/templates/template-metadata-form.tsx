"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { UnsavedChangesDialog } from "@/app/(staff)/components/unsaved-changes-dialog";
import { useUnsavedChangesGuard } from "@/app/(staff)/components/use-unsaved-changes-guard";
import {
  updateCanonicalTemplateMetadataAction,
  type CanonicalTemplateActionState,
} from "@/app/(staff)/(operator)/operator/templates/actions";
import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
  type ServiceCategory,
} from "@/lib/aftercare/service-category";

const initial: CanonicalTemplateActionState = {};

function snapshot(values: {
  title: string;
  slug: string;
  serviceCategory: string;
}): string {
  return JSON.stringify(values);
}

export function TemplateMetadataForm({
  templateId,
  title,
  slug,
  serviceCategory,
  metadataLocked,
}: {
  templateId: string;
  title: string;
  slug: string;
  serviceCategory: ServiceCategory;
  metadataLocked: boolean;
}) {
  const [state, action, pending] = useActionState(
    updateCanonicalTemplateMetadataAction,
    initial
  );
  const [titleValue, setTitleValue] = useState(title);
  const [slugValue, setSlugValue] = useState(slug);
  const [categoryValue, setCategoryValue] = useState(serviceCategory);
  const [confirmed, setConfirmed] = useState(() =>
    snapshot({ title, slug, serviceCategory })
  );
  const [leaving, setLeaving] = useState(false);
  const current = snapshot({
    title: titleValue,
    slug: slugValue,
    serviceCategory: categoryValue,
  });
  const currentRef = useRef(current);
  const leavingRef = useRef(false);
  const handledState = useRef(state);
  currentRef.current = current;
  const dirty = current !== confirmed;
  const { open, keepEditing, discard } = useUnsavedChangesGuard(dirty);

  useEffect(() => {
    if (handledState.current === state) {
      return;
    }
    handledState.current = state;
    if (state.error) {
      if (leavingRef.current) {
        leavingRef.current = false;
        setLeaving(false);
        keepEditing();
      }
      return;
    }
    if (!state.ok) {
      return;
    }
    setConfirmed(currentRef.current);
    if (leavingRef.current) {
      leavingRef.current = false;
      setLeaving(false);
      discard();
    }
  }, [state, keepEditing, discard]);

  function saveAndLeave() {
    const form = document.getElementById(
      "template-metadata-form"
    ) as HTMLFormElement | null;
    if (!form?.reportValidity()) {
      return;
    }
    leavingRef.current = true;
    setLeaving(true);
    form.requestSubmit();
  }

  return (
    <form
      id="template-metadata-form"
      action={action}
      className="flex max-w-lg flex-col gap-4"
    >
      <input type="hidden" name="templateId" value={templateId} />
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="template-title">
          Title
        </label>
        <input
          id="template-title"
          name="title"
          required
          value={titleValue}
          onChange={(event) => setTitleValue(event.target.value)}
          className="staffField"
        />
        {state.fieldErrors?.title ? (
          <p className="text-sm text-red-600">{state.fieldErrors.title}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="template-slug">
          Slug
        </label>
        <input
          id="template-slug"
          name={metadataLocked ? undefined : "slug"}
          required
          value={slugValue}
          readOnly={metadataLocked}
          aria-readonly={metadataLocked}
          onChange={(event) => setSlugValue(event.target.value)}
          className="staffField staffFieldNarrow"
        />
        {metadataLocked ? (
          <p className="text-sm text-staff-muted">
            The slug cannot change after the first published revision.
          </p>
        ) : null}
        {state.fieldErrors?.slug ? (
          <p className="text-sm text-red-600">{state.fieldErrors.slug}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="template-category">
          Service category
        </label>
        {metadataLocked ? (
          <input
            id="template-category"
            value={SERVICE_CATEGORY_LABELS[serviceCategory]}
            readOnly
            aria-readonly="true"
            className="staffField"
          />
        ) : (
          <select
            id="template-category"
            name="serviceCategory"
            value={categoryValue}
            className="staffSelect"
            onChange={(event) =>
              setCategoryValue(event.target.value as ServiceCategory)
            }
          >
            {SERVICE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {SERVICE_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        )}
        {metadataLocked ? (
          <p className="text-sm text-staff-muted">
            The service category cannot change after the first published
            revision.
          </p>
        ) : null}
      </div>
      {state.ok ? (
        <p className="text-sm text-staff-muted" role="status">
          Template details saved.
        </p>
      ) : null}
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
        {pending ? "Saving…" : "Save details"}
      </button>
      <UnsavedChangesDialog
        open={open}
        pending={leaving || pending}
        onStay={keepEditing}
        onLeave={discard}
        onSave={saveAndLeave}
      />
    </form>
  );
}
