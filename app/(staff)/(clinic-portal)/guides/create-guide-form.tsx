"use client";

import { useActionState } from "react";

import {
  createCustomGuideAction,
  createGuideFromTemplateAction,
  type GuideActionState,
} from "@/app/(staff)/(clinic-portal)/guides/actions";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import type { CanonicalGuideTemplateOption } from "@/lib/clinic-portal/list-canonical-templates";
import type { GuideAllowanceSummary } from "@/lib/entitlements/guide-usage";

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
            ? `Use a ${PRODUCT_NAME} sample template, then adapt it for this demo.`
            : allowance.governed && !allowance.canAdaptRiverTemplates
              ? `Use a ${PRODUCT_NAME} template as supplied. This plan does not adapt templates into clinic-specific guides.`
              : allowance.canAdaptRiverTemplates
                ? `Enable a ${PRODUCT_NAME} template as supplied. Adapting it into a custom clinic guide is done from the editor and uses a custom-guide place.`
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
        {allowance.usageLabel ? (
          <p className="mt-3 text-sm font-medium text-staff-ink">
            {allowance.usageLabel}
          </p>
        ) : null}
        {allowance.atLimit ? (
          <div className="mt-3 text-sm leading-6 text-staff-muted">
            <p>
              {allowance.limitMessage} Existing custom guides can still be
              edited.
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
              disabled={customPending || allowance.atLimit}
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
              disabled={customPending || allowance.atLimit}
              placeholder="extraction"
              className="h-11 rounded-md border border-staff-line bg-staff-panel px-3 text-sm"
            />
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
          {allowance.atLimit ? null : (
            <button
              type="submit"
              disabled={customPending}
              className="staffBtn staffBtnPrimary"
            >
              {customPending ? "Creating…" : "Create custom guide"}
            </button>
          )}
        </form>
      </section>
    </div>
  );
}
