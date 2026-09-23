"use client";

import { useActionState } from "react";

import {
  adaptGuideFromTemplateAction,
  type GuideActionState,
} from "@/app/(staff)/(clinic-portal)/guides/actions";
import { TEMPLATE_EDIT_NOTE } from "@/lib/entitlements/messages";

const initial: GuideActionState = {};

export function TemplateAdaptationPanel({
  guideId,
  mode,
  contactHref,
  limitMessage,
}: {
  guideId: string;
  mode: "available" | "full";
  contactHref: string;
  limitMessage: string | null;
}) {
  const [state, action, pending] = useActionState(
    adaptGuideFromTemplateAction,
    initial
  );

  return (
    <section className="mb-6 rounded-xl border border-staff-line bg-staff-panel p-5">
      {mode === "full" ? (
        <div className="text-sm leading-6 text-staff-muted">
          <p>
            {limitMessage} This River template can still be used as supplied.
            Existing editable copies can still be edited.
          </p>
          <a
            href={contactHref}
            className="staffBtn staffBtnSecondary mt-4 inline-flex h-11 items-center"
          >
            Contact River Aftercare
          </a>
        </div>
      ) : (
        <>
          <p className="text-sm leading-6 text-staff-muted">
            {TEMPLATE_EDIT_NOTE} The River template itself stays unchanged.
          </p>
          <form action={action} className="mt-4">
            <input type="hidden" name="guideId" value={guideId} />
            <button
              type="submit"
              className="staffBtn staffBtnPrimary h-11"
              disabled={pending}
            >
              {pending ? "Editing…" : "Edit template"}
            </button>
          </form>
        </>
      )}
      {state.error ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="mt-3 text-sm text-staff-ink" role="status">
          This is now your clinic’s editable copy.
        </p>
      ) : null}
    </section>
  );
}
