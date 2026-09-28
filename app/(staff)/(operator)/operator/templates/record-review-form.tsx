"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  recordCanonicalTemplateReviewAction,
  type CanonicalTemplateActionState,
} from "@/app/(staff)/(operator)/operator/templates/actions";

const initial: CanonicalTemplateActionState = {};

export function RecordReviewForm({
  templateId,
  revisionId,
  reviewerName,
  reviewerCredential,
  reviewNote,
  reviewed,
}: {
  templateId: string;
  revisionId: string;
  reviewerName: string;
  reviewerCredential: string;
  reviewNote: string;
  reviewed: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    recordCanonicalTemplateReviewAction,
    initial
  );

  useEffect(() => {
    if (state.ok) {
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <form action={action} className="flex max-w-lg flex-col gap-4">
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="revisionId" value={revisionId} />
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="reviewerName">
          Reviewer name
        </label>
        <input
          id="reviewerName"
          name="reviewerName"
          required
          defaultValue={reviewerName}
          className="staffField"
          aria-invalid={state.fieldErrors?.reviewerName ? true : undefined}
        />
        <p className="text-sm text-staff-muted">
          The person whose review is being recorded. They do not need a River
          account.
        </p>
        {state.fieldErrors?.reviewerName ? (
          <p className="text-sm text-red-600">
            {state.fieldErrors.reviewerName}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="reviewerCredential">
          Reviewer credential
        </label>
        <input
          id="reviewerCredential"
          name="reviewerCredential"
          defaultValue={reviewerCredential}
          className="staffField"
        />
        <p className="text-sm text-staff-muted">
          Optional. A short role or credential. River does not check an external
          register.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="reviewNote">
          Review note
        </label>
        <textarea
          id="reviewNote"
          name="reviewNote"
          defaultValue={reviewNote}
          rows={4}
          className="staffField"
        />
        <p className="text-sm text-staff-muted">
          Optional internal context. The signed-in Operator is stored
          automatically as the person who recorded this evidence.
        </p>
      </div>
      {state.ok ? (
        <p className="text-sm text-staff-muted" role="status">
          Review recorded.
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
        {pending
          ? "Recording…"
          : reviewed
            ? "Replace review evidence"
            : "Record review"}
      </button>
    </form>
  );
}
