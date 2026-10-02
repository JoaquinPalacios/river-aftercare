"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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
import {
  classificationFromIsSample,
  type CanonicalTemplateClassification,
} from "@/lib/canonical-templates/classification";
import {
  activeSampleForCategory,
  TemplateClassificationField,
  type TemplateClassificationOption,
} from "@/app/(staff)/(operator)/operator/templates/template-classification-field";

const initial: CanonicalTemplateActionState = {};

function snapshot(values: {
  title: string;
  slug: string;
  serviceCategory: string;
  classification: string;
}): string {
  return JSON.stringify(values);
}

export function TemplateMetadataForm({
  templateId,
  title,
  slug,
  serviceCategory,
  isSample,
  metadataLocked,
  activeSamples,
}: {
  templateId: string;
  title: string;
  slug: string;
  serviceCategory: ServiceCategory;
  isSample: boolean;
  metadataLocked: boolean;
  activeSamples: readonly TemplateClassificationOption[];
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    updateCanonicalTemplateMetadataAction,
    initial
  );
  const [titleValue, setTitleValue] = useState(title);
  const [slugValue, setSlugValue] = useState(slug);
  const [categoryValue, setCategoryValue] = useState(serviceCategory);
  const [classification, setClassification] =
    useState<CanonicalTemplateClassification>(
      classificationFromIsSample(isSample)
    );
  const [confirmed, setConfirmed] = useState(() =>
    snapshot({
      title,
      slug,
      serviceCategory,
      classification: classificationFromIsSample(isSample),
    })
  );
  const [leaving, setLeaving] = useState(false);
  const current = snapshot({
    title: titleValue,
    slug: slugValue,
    serviceCategory: categoryValue,
    classification,
  });
  const slotOccupant = activeSampleForCategory(
    activeSamples,
    categoryValue,
    templateId
  );
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
      return;
    }
    router.refresh();
  }, [state, keepEditing, discard, router]);

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
      className="flex w-full min-w-0 flex-col gap-4"
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
      {metadataLocked ? (
        <div className="grid gap-3 text-sm">
          <div>
            <p className="font-medium">Slug</p>
            <p className="mt-1 break-words text-staff-muted">{slug}</p>
          </div>
          <div>
            <p className="font-medium">Service category</p>
            <p className="mt-1 text-staff-muted">
              {SERVICE_CATEGORY_LABELS[serviceCategory]}
            </p>
          </div>
          <div>
            <p className="font-medium">Classification</p>
            <p className="mt-1 text-staff-muted">
              {isSample ? "Sample" : "Production"}
            </p>
          </div>
          <p className="text-staff-muted">
            Slug, service category, and classification stay fixed after the
            first publication.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="template-slug">
              Slug
            </label>
            <input
              id="template-slug"
              name="slug"
              required
              value={slugValue}
              onChange={(event) => setSlugValue(event.target.value)}
              className="staffField staffFieldNarrow"
            />
            {state.fieldErrors?.slug ? (
              <p className="text-sm text-red-600">{state.fieldErrors.slug}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="template-category">
              Service category
            </label>
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
          </div>
          <TemplateClassificationField
            value={classification}
            onChange={setClassification}
            serviceCategory={categoryValue}
            activeSample={classification === "SAMPLE" ? slotOccupant : null}
            error={state.fieldErrors?.classification}
          />
        </>
      )}
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
