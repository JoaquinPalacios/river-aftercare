"use client";

import { useActionState } from "react";

import {
  adaptGuideFromTemplateAction,
  type GuideActionState,
} from "@/app/(staff)/(clinic-portal)/guides/actions";

const initial: GuideActionState = {};

export function TemplateAdaptationPanel({
  guideId,
  mode,
  contactHref,
  limitMessage,
}: {
  guideId: string;
  mode: "essential" | "practice" | "practice_full";
  contactHref: string;
  limitMessage: string | null;
}) {
  const [state, action, pending] = useActionState(
    adaptGuideFromTemplateAction,
    initial
  );

  return (
    <section className="mb-6 rounded-xl border border-staff-line bg-staff-panel p-5">
      {mode === "essential" ? (
        <>
          <p className="text-sm leading-6 text-staff-muted">
            This River Aftercare template is used as supplied. Essential does
            not adapt templates into clinic-specific guides. Custom clinic
            guides keep the normal editor.
          </p>
          <a
            href={contactHref}
            className="staffBtn staffBtnSecondary mt-4 inline-flex h-11 items-center"
          >
            Contact River Aftercare
          </a>
        </>
      ) : null}
      {mode === "practice_full" ? (
        <p className="text-sm leading-6 text-staff-muted">
          {limitMessage} Adapting this template would create another custom
          clinic guide. Existing guides can still be edited. Delete a custom
          guide you no longer need to free a place.
        </p>
      ) : null}
      {mode === "practice" ? (
        <>
          <p className="text-sm leading-6 text-staff-muted">
            Adapting keeps the River Aftercare template unchanged and turns this
            guide into a clinic-owned custom guide. That custom guide uses one
            place in the clinic allowance. Later edits use the normal editor.
          </p>
          <form action={action} className="mt-4">
            <input type="hidden" name="guideId" value={guideId} />
            <button
              type="submit"
              className="staffBtn staffBtnPrimary h-11"
              disabled={pending}
            >
              {pending ? "Adapting…" : "Adapt template"}
            </button>
          </form>
        </>
      ) : null}
      {state.error ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="mt-3 text-sm text-staff-ink" role="status">
          This guide is now a custom clinic guide.
        </p>
      ) : null}
    </section>
  );
}
