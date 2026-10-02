"use client";

import { useActionState, useState } from "react";

import { ConfirmDialog } from "@/app/(staff)/components/confirm-dialog";
import {
  updateLiveDemoAction,
  type CanonicalTemplateActionState,
} from "@/app/(staff)/(operator)/operator/templates/actions";
import type { DesignatedDemoAdoptionView } from "@/lib/demo-adoption/load-designated-demo-adoption";

const initial: CanonicalTemplateActionState = {};

export function TemplateDemoAdoption({
  templateId,
  adoption,
  publicUrl,
}: {
  templateId: string;
  adoption: DesignatedDemoAdoptionView;
  publicUrl: string | null;
}) {
  const [state, action, pending] = useActionState(
    updateLiveDemoAction,
    initial
  );
  const [open, setOpen] = useState(false);
  const previewHref = `/operator/templates/${templateId}/demo-preview`;

  return (
    <section
      className="templateOverviewCard"
      aria-labelledby="live-demo-heading"
      data-demo-adoption=""
    >
      <h2 id="live-demo-heading">Live demo</h2>
      <p className="mt-2 text-sm text-staff-muted">
        Publishing a sample revision does not change the public demo. Update
        live demo only after you confirm the revision below.
      </p>
      <DemoAdoptionSummary adoption={adoption} publicUrl={publicUrl} />
      <div className="mt-4 flex flex-wrap gap-2">
        {publicUrl ? (
          <a
            className="staffBtn staffBtnSecondary"
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open live demo
          </a>
        ) : null}
        {adoption.canUpdate ? (
          <a
            className="staffBtn staffBtnSecondary"
            href={previewHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            Preview proposed content
          </a>
        ) : null}
        {adoption.canUpdate ? (
          <button
            type="button"
            className="staffBtn staffBtnPrimary"
            onClick={() => setOpen(true)}
          >
            Update live demo
          </button>
        ) : null}
      </div>
      {adoption.blocker ? (
        <p className="mt-3 text-sm" role="status">
          {adoption.blocker}
        </p>
      ) : null}
      {state.error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      <form
        id={`update-live-demo-${templateId}`}
        action={action}
        className="hidden"
      >
        <input type="hidden" name="templateId" value={templateId} />
        <input
          type="hidden"
          name="canonicalRevisionId"
          value={adoption.latestPublishedRevisionId}
        />
        <input
          type="hidden"
          name="expectedPinnedRevisionId"
          value={adoption.pinnedRevisionId ?? ""}
        />
        <input
          type="hidden"
          name="expectedPublishedPracticeGuideRevisionId"
          value={adoption.publishedPracticeGuideRevisionId ?? ""}
        />
      </form>
      <ConfirmDialog
        open={open}
        title="Update live demo?"
        description={
          adoption.alreadyCurrent
            ? "The live demo already uses this published sample revision. Confirming will not create another revision."
            : "This publishes a new practice-guide revision for the designated demo and leaves older revisions unchanged."
        }
        cancelLabel="Cancel"
        confirmLabel="Update live demo"
        confirmTone="primary"
        pending={pending}
        pendingLabel="Updating…"
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          const form = document.getElementById(
            `update-live-demo-${templateId}`
          ) as HTMLFormElement | null;
          form?.requestSubmit();
        }}
      >
        <DemoAdoptionSummary adoption={adoption} publicUrl={publicUrl} />
      </ConfirmDialog>
    </section>
  );
}

function DemoAdoptionSummary({
  adoption,
  publicUrl,
}: {
  adoption: DesignatedDemoAdoptionView;
  publicUrl: string | null;
}) {
  return (
    <dl className="mt-4 grid gap-3 text-sm">
      <div>
        <dt className="font-medium">Demo clinic</dt>
        <dd className="mt-1 text-staff-muted">
          {adoption.clinicName}
          {publicUrl ? (
            <>
              {" "}
              · <a href={publicUrl}>{publicUrl}</a>
            </>
          ) : adoption.publicSlug ? (
            ` · /${adoption.publicSlug}`
          ) : null}
        </dd>
      </div>
      <div>
        <dt className="font-medium">Pinned canonical revision</dt>
        <dd className="mt-1 text-staff-muted">
          {revisionLabel(adoption.pinnedRevisionVersion)}
        </dd>
      </div>
      <div>
        <dt className="font-medium">Published practice-guide revision</dt>
        <dd className="mt-1 text-staff-muted">
          {revisionLabel(adoption.publishedPracticeGuideRevisionVersion)}
        </dd>
      </div>
      <div>
        <dt className="font-medium">Latest published sample revision</dt>
        <dd className="mt-1 text-staff-muted">
          {revisionLabel(adoption.latestPublishedRevisionVersion)}
        </dd>
      </div>
      <div>
        <dt className="font-medium">Already up to date</dt>
        <dd className="mt-1 text-staff-muted">
          {adoption.alreadyCurrent ? "Yes" : "No"}
        </dd>
      </div>
      <div>
        <dt className="font-medium">Clinic overrides kept</dt>
        <dd className="mt-1 text-staff-muted">
          {adoption.overrides.length === 0
            ? "None"
            : adoption.overrides
                .map((override) => `${override.sectionKey}: ${override.title}`)
                .join("; ")}
        </dd>
      </div>
      <div>
        <dt className="font-medium">Additional sections kept</dt>
        <dd className="mt-1 text-staff-muted">
          {adoption.additions.length === 0
            ? "None"
            : adoption.additions
                .map((addition) =>
                  addition.insertAfterSectionKey
                    ? `${addition.title} after ${addition.insertAfterSectionKey}`
                    : addition.title
                )
                .join("; ")}
        </dd>
      </div>
    </dl>
  );
}

function revisionLabel(version: number | null): string {
  return version === null ? "None" : `Revision ${version}`;
}
