"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import {
  createCustomGuideAction,
  createGuideFromTemplateAction,
  type GuideActionState,
} from "@/app/(staff)/(clinic-portal)/guides/actions";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import type { CanonicalGuideTemplateOption } from "@/lib/clinic-portal/list-canonical-templates";
import type { GuideAllowanceSummary } from "@/lib/entitlements/guide-usage";
import { suggestGuideSlug } from "@/lib/clinics/slug-suggestion";

const initialState: GuideActionState = {};

export function CreateGuideForm({
  templates,
  isDemoTenant,
  allowance,
  contactHref,
}: {
  templates: CanonicalGuideTemplateOption[];
  isDemoTenant: boolean;
  allowance: GuideAllowanceSummary;
  contactHref: string;
}) {
  const [templateState, templateAction, templatePending] = useActionState(
    createGuideFromTemplateAction,
    initialState
  );
  const [customState, customAction, customPending] = useActionState(
    createCustomGuideAction,
    initialState
  );
  const [title, setTitle] = useState("");
  const [publicSlug, setPublicSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const customLocked =
    customPending ||
    allowance.customGuides.atLimit ||
    allowance.combinedGuides.atLimit;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl border border-staff-line bg-staff-panel p-5 shadow-sm">
        <h2 className="text-base font-semibold tracking-tight">
          {isDemoTenant
            ? "Start from a template"
            : "Start from a reviewed template"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-staff-muted">
          {isDemoTenant
            ? `Use a ${PRODUCT_NAME} sample template, then adapt it for this demo. Editing it creates your clinic’s own copy and uses one editable-template allowance.`
            : allowance.governed
              ? `Enable a ${PRODUCT_NAME} template as supplied. Using it unchanged does not use a custom-guide or editable-template place. Editing it later creates your clinic’s own copy and uses one editable-template allowance.`
              : `Enable a reviewed ${PRODUCT_NAME} template for this practice.`}
        </p>
        {templates.length === 0 ? (
          <p className="mt-4 text-sm text-staff-muted">
            {isDemoTenant
              ? "No sample templates are available yet."
              : "No reviewed templates are available yet."}
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {templates.map((template) => (
              <li
                key={template.id}
                className="rounded-lg border border-staff-line px-4 py-3"
              >
                <p className="font-medium text-staff-ink">{template.title}</p>
                <p className="mt-1 text-sm text-staff-muted">
                  {template.alreadyEnabled
                    ? "Already in your guides"
                    : template.availability === "sample"
                      ? "Sample template"
                      : "Reviewed template"}
                </p>
                {template.alreadyEnabled ? null : (
                  <form action={templateAction} className="mt-3">
                    <input
                      type="hidden"
                      name="templateId"
                      value={template.id}
                    />
                    {templateState.error ? (
                      <p className="mb-2 text-sm text-red-600" role="alert">
                        {templateState.error}
                      </p>
                    ) : null}
                    <button
                      type="submit"
                      disabled={templatePending}
                      className="staffBtn staffBtnPrimary"
                    >
                      {templatePending ? "Creating…" : "Create from template"}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-staff-line bg-staff-panel p-5 shadow-sm">
        <h2 className="text-base font-semibold tracking-tight">
          Create a custom guide
        </h2>
        <p className="mt-2 text-sm leading-6 text-staff-muted">
          Start from a blank guide for a treatment unique to this clinic.
        </p>
        {allowance.customGuides.usageLabel ? (
          <p className="mt-3 text-sm font-medium text-staff-ink">
            {allowance.customGuides.usageLabel}
          </p>
        ) : null}
        {allowance.adaptedTemplates.usageLabel ? (
          <p className="mt-1 text-sm font-medium text-staff-ink">
            {allowance.adaptedTemplates.usageLabel}
          </p>
        ) : null}
        {allowance.combinedGuides.usageLabel ? (
          <p className="mt-1 text-sm font-medium text-staff-ink">
            {allowance.combinedGuides.usageLabel}
          </p>
        ) : null}
        {allowance.customGuides.atLimit || allowance.combinedGuides.atLimit ? (
          <div className="mt-3 text-sm leading-6 text-staff-muted">
            <p>
              {allowance.customGuides.atLimit
                ? allowance.customGuides.limitMessage
                : allowance.combinedGuides.limitMessage}{" "}
              Existing custom guides can still be edited.
            </p>
            <a
              href={contactHref}
              className="staffBtn staffBtnSecondary mt-3 inline-flex h-11 items-center"
            >
              Contact River Aftercare
            </a>
          </div>
        ) : null}
        <form action={customAction} className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="title">
              Guide title
            </label>
            <input
              id="title"
              name="title"
              required
              value={title}
              onChange={(event) => {
                const next = event.target.value;
                setTitle(next);
                if (!slugEdited) {
                  setPublicSlug(suggestGuideSlug(next));
                }
              }}
              disabled={customLocked}
              className="h-11 rounded-md border border-staff-line bg-staff-panel px-3 text-sm"
            />
            {customState.fieldErrors?.title ? (
              <p className="text-sm text-red-600">
                {customState.fieldErrors.title}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="publicSlug">
              Public slug
            </label>
            <input
              id="publicSlug"
              name="publicSlug"
              required
              value={publicSlug}
              onChange={(event) => {
                setSlugEdited(true);
                setPublicSlug(event.target.value);
              }}
              disabled={customLocked}
              placeholder="extraction"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              aria-describedby="publicSlug-hint"
              className="h-11 rounded-md border border-staff-line bg-staff-panel px-3 text-sm"
            />
            <p id="publicSlug-hint" className="text-sm text-staff-muted">
              This becomes part of the patient guide URL.
            </p>
            {customState.fieldErrors?.publicSlug ? (
              <p className="text-sm text-red-600">
                {customState.fieldErrors.publicSlug}
              </p>
            ) : null}
          </div>
          {customState.error ? (
            <p className="text-sm text-red-600" role="alert">
              {customState.error}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <Link
              href="/guides"
              className="staffBtn staffBtnSecondary h-11 w-full sm:w-auto"
            >
              Cancel
            </Link>
            {allowance.customGuides.atLimit ||
            allowance.combinedGuides.atLimit ? null : (
              <button
                type="submit"
                disabled={customPending}
                className="staffBtn staffBtnPrimary h-11 w-full sm:w-auto"
              >
                {customPending ? "Creating…" : "Create custom guide"}
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
