"use client";

import { useActionState } from "react";
import Link from "next/link";

import {
  createCanonicalTemplateDraftAction,
  type CanonicalTemplateActionState,
} from "@/app/(staff)/(operator)/operator/templates/actions";

const initial: CanonicalTemplateActionState = {};

export function TemplateEditAction({
  templateId,
  hasOpenDraft,
}: {
  templateId: string;
  hasOpenDraft: boolean;
}) {
  const [state, action, pending] = useActionState(
    createCanonicalTemplateDraftAction,
    initial
  );

  if (hasOpenDraft) {
    return (
      <Link
        href={`/operator/templates/${templateId}/draft`}
        className="staffBtn staffBtnPrimary"
        data-template-edit="open-draft"
      >
        Edit
      </Link>
    );
  }

  return (
    <form action={action} data-template-edit="create-draft">
      <input type="hidden" name="templateId" value={templateId} />
      <button
        type="submit"
        className="staffBtn staffBtnPrimary"
        disabled={pending}
      >
        {pending ? "Opening…" : "Edit"}
      </button>
      {state.error ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
