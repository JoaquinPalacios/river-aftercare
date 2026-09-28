"use client";

import { useActionState } from "react";

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

  return (
    <form action={action} className="flex max-w-lg flex-col gap-4">
      <input type="hidden" name="templateId" value={templateId} />
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="template-title">
          Title
        </label>
        <input
          id="template-title"
          name="title"
          required
          defaultValue={title}
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
          defaultValue={slug}
          readOnly={metadataLocked}
          aria-readonly={metadataLocked}
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
            defaultValue={serviceCategory}
            className="staffSelect"
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
    </form>
  );
}
