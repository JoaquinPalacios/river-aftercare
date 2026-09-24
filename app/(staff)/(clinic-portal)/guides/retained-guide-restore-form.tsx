"use client";

import { useActionState } from "react";

import {
  restoreRetainedGuideAction,
  type GuideActionState,
} from "@/app/(staff)/(clinic-portal)/guides/actions";

const initial: GuideActionState = {};

export function RetainedGuideRestoreForm({ guideId }: { guideId: string }) {
  const [state, action, pending] = useActionState(
    restoreRetainedGuideAction,
    initial
  );
  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="guideId" value={guideId} />
      <button
        type="submit"
        className="staffBtn staffBtnSecondary h-11"
        disabled={pending}
      >
        {pending ? "Restoring…" : "Restore guide"}
      </button>
      {state.error ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="mt-2 text-sm" role="status">
          This guide is active again.
        </p>
      ) : null}
    </form>
  );
}
