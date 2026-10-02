"use client";

import { useActionState, useId, useState, type ReactNode } from "react";

import { ConfirmDialog } from "@/app/(staff)/components/confirm-dialog";
import {
  updateLiveDemoAction,
  type CanonicalTemplateActionState,
} from "@/app/(staff)/(operator)/operator/templates/actions";
import { liveDemoUpdateOffered } from "@/lib/demo-adoption/live-demo-currency";
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
      <LiveDemoUpdateActions
        templateId={templateId}
        adoption={adoption}
        publicUrl={publicUrl}
      >
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
            href={`/operator/templates/${templateId}/demo-preview`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Preview proposed content
          </a>
        ) : null}
      </LiveDemoUpdateActions>
    </section>
  );
}

export function WorkspaceLiveDemoUpdate({
  templateId,
  adoption,
  publicUrl,
}: {
  templateId: string;
  adoption: DesignatedDemoAdoptionView;
  publicUrl: string | null;
}) {
  if (!liveDemoUpdateOffered(adoption)) {
    return null;
  }
  return (
    <LiveDemoUpdateActions
      templateId={templateId}
      adoption={adoption}
      publicUrl={publicUrl}
      bare
      showBlocker={false}
    />
  );
}

function LiveDemoUpdateActions({
  templateId,
  adoption,
  publicUrl,
  bare = false,
  showBlocker = true,
  children,
}: {
  templateId: string;
  adoption: DesignatedDemoAdoptionView;
  publicUrl: string | null;
  bare?: boolean;
  showBlocker?: boolean;
  children?: ReactNode;
}) {
  const [state, action, pending] = useActionState(
    updateLiveDemoAction,
    initial
  );
  const [open, setOpen] = useState(false);
  const offered = liveDemoUpdateOffered(adoption);
  const trigger = (
    <>
      {children}
      {offered ? (
        <button
          type="button"
          className="staffBtn staffBtnPrimary"
          data-update-live-demo=""
          onClick={() => setOpen(true)}
        >
          Update live demo
        </button>
      ) : null}
    </>
  );

  return (
    <>
      {bare ? (
        trigger
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">{trigger}</div>
      )}
      {showBlocker && adoption.blocker ? (
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
        pendingStatus="Updating the live demo. Please wait."
        dialogClassName="liveDemoConfirm"
        layoutClassName="liveDemoConfirmFrame"
        scrollRegionClassName="liveDemoConfirmScroll"
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          const form = document.getElementById(
            `update-live-demo-${templateId}`
          ) as HTMLFormElement | null;
          form?.requestSubmit();
        }}
      >
        <LiveDemoConfirmDetails adoption={adoption} publicUrl={publicUrl} />
      </ConfirmDialog>
    </>
  );
}

function LiveDemoConfirmDetails({
  adoption,
  publicUrl,
}: {
  adoption: DesignatedDemoAdoptionView;
  publicUrl: string | null;
}) {
  const keptHeadingId = useId();
  const current = revisionLabel(adoption.pinnedRevisionVersion);
  const next = revisionLabel(adoption.latestPublishedRevisionVersion);
  return (
    <div className="liveDemoConfirmDetails">
      <div className="liveDemoConfirmClinic">
        <p className="liveDemoConfirmKicker">Demo clinic</p>
        <p className="liveDemoConfirmClinicName">{adoption.clinicName}</p>
        {publicUrl ? (
          <a className="liveDemoConfirmUrl" href={publicUrl}>
            {publicUrl}
          </a>
        ) : adoption.publicSlug ? (
          <p className="liveDemoConfirmUrl">/{adoption.publicSlug}</p>
        ) : null}
      </div>
      <div
        className="liveDemoConfirmTransition"
        data-same={adoption.alreadyCurrent ? "true" : "false"}
      >
        <div>
          <p className="liveDemoConfirmKicker">Current revision</p>
          <p className="liveDemoConfirmRevision">{current}</p>
        </div>
        <span className="liveDemoConfirmArrow">
          <span className="sr-only">to</span>
          <span aria-hidden="true">→</span>
        </span>
        <div>
          <p className="liveDemoConfirmKicker">New revision</p>
          <p className="liveDemoConfirmRevision liveDemoConfirmRevisionNext">
            {next}
          </p>
        </div>
      </div>
      <section
        className="liveDemoConfirmSecondary"
        aria-labelledby={keptHeadingId}
      >
        <h3 id={keptHeadingId}>Kept on the demo</h3>
        <dl>
          <div>
            <dt>Current practice revision</dt>
            <dd>
              {revisionLabel(adoption.publishedPracticeGuideRevisionVersion)}
            </dd>
          </div>
          <div>
            <dt>Clinic overrides kept</dt>
            <dd>
              {adoption.overrides.length === 0 ? (
                "None"
              ) : (
                <ul>
                  {adoption.overrides.map((override) => (
                    <li key={override.sectionKey}>
                      {override.sectionKey}: {override.title}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
          <div>
            <dt>Additional sections kept</dt>
            <dd>
              {adoption.additions.length === 0 ? (
                "None"
              ) : (
                <ul>
                  {adoption.additions.map((addition) => (
                    <li key={addition.key}>
                      {addition.insertAfterSectionKey
                        ? `${addition.title} after ${addition.insertAfterSectionKey}`
                        : addition.title}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        </dl>
      </section>
    </div>
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
