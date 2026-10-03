"use client";

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  duplicateCanonicalTemplateAction,
  type CanonicalTemplateActionState,
} from "@/app/(staff)/(operator)/operator/templates/actions";
import {
  activeSampleForCategory,
  TemplateClassificationField,
  type TemplateClassificationOption,
} from "@/app/(staff)/(operator)/operator/templates/template-classification-field";
import { isValidCareGuideSlug } from "@/lib/aftercare/slug-rules";
import type { ServiceCategory } from "@/lib/aftercare/service-category";
import type { CanonicalTemplateClassification } from "@/lib/canonical-templates/classification";
import { isReservedDemoCanonicalSlug } from "@/lib/canonical-templates/constants";
import {
  CANONICAL_DUPLICATE_DESCRIPTION,
  CANONICAL_DUPLICATE_UNPUBLISHED_MESSAGE,
  suggestDuplicateTemplateTitle,
} from "@/lib/canonical-templates/duplicate-template-messages";
import { suggestGuideSlug } from "@/lib/clinics/slug-suggestion";

const initial: CanonicalTemplateActionState = {};

export function DuplicateTemplateAction({
  sourceTemplateId,
  sourceTitle,
  serviceCategory,
  serviceCategoryLabel,
  published,
  activeSamples,
}: {
  sourceTemplateId: string;
  sourceTitle: string;
  serviceCategory: ServiceCategory;
  serviceCategoryLabel: string;
  published: boolean;
  activeSamples: readonly TemplateClassificationOption[];
}) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  const noteId = useId();

  return (
    <div className="templateDuplicate" data-duplicate-template="">
      <button
        type="button"
        className="staffBtn staffBtnSecondary"
        disabled={!published}
        aria-haspopup={published ? "dialog" : undefined}
        aria-expanded={published ? open : undefined}
        aria-describedby={published ? undefined : noteId}
        onClick={() => {
          setSession((value) => value + 1);
          setOpen(true);
        }}
      >
        Duplicate template
      </button>
      {published ? null : (
        <p id={noteId} className="templateDuplicateNote">
          {CANONICAL_DUPLICATE_UNPUBLISHED_MESSAGE}
        </p>
      )}
      {published ? (
        <DuplicateTemplateDialog
          key={session}
          open={open}
          sourceTemplateId={sourceTemplateId}
          sourceTitle={sourceTitle}
          serviceCategory={serviceCategory}
          serviceCategoryLabel={serviceCategoryLabel}
          activeSamples={activeSamples}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

function DuplicateTemplateDialog({
  open,
  sourceTemplateId,
  sourceTitle,
  serviceCategory,
  serviceCategoryLabel,
  activeSamples,
  onClose,
}: {
  open: boolean;
  sourceTemplateId: string;
  sourceTitle: string;
  serviceCategory: ServiceCategory;
  serviceCategoryLabel: string;
  activeSamples: readonly TemplateClassificationOption[];
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    duplicateCanonicalTemplateAction,
    initial
  );
  const [title, setTitle] = useState(() =>
    suggestDuplicateTemplateTitle(sourceTitle)
  );
  const [slug, setSlug] = useState(() =>
    suggestGuideSlug(suggestDuplicateTemplateTitle(sourceTitle))
  );
  const [slugEdited, setSlugEdited] = useState(false);
  const [classification, setClassification] =
    useState<CanonicalTemplateClassification>("PRODUCTION");
  const [submitLocked, setSubmitLocked] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const submitLockedRef = useRef(false);
  const pendingRef = useRef(pending);
  const titleId = useId();
  const descriptionId = useId();
  const titleFieldId = useId();
  const slugFieldId = useId();
  const slugHintId = useId();
  const categoryHintId = useId();
  const titleErrorId = useId();
  const slugErrorId = useId();
  const formErrorId = useId();
  const activeSample = activeSampleForCategory(activeSamples, serviceCategory);
  const sampleBlocked = classification === "SAMPLE" && activeSample !== null;
  const titleReady = title.trim().length > 0 && title.trim().length <= 120;
  const slugReady =
    isValidCareGuideSlug(slug) && !isReservedDemoCanonicalSlug(slug);
  const busy = pending || submitLocked;
  const canDuplicate = titleReady && slugReady && !sampleBlocked && !busy;

  function unlockSubmit() {
    submitLockedRef.current = false;
    setSubmitLocked(false);
  }

  useEffect(() => {
    if (pendingRef.current && !pending) {
      unlockSubmit();
    }
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open) {
      restoreRef.current = document.activeElement as HTMLElement | null;
      if (!dialog.open) {
        dialog.showModal();
      }
      titleRef.current?.focus();
      return;
    }
    if (dialog.open) {
      dialog.close();
    }
    restoreRef.current?.focus();
  }, [open]);

  function updateTitle(next: string) {
    setTitle(next);
    if (!slugEdited) {
      setSlug(suggestGuideSlug(next));
    }
  }

  function requestClose() {
    if (busy) {
      return;
    }
    onClose();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (submitLockedRef.current || !canDuplicate) {
      event.preventDefault();
      return;
    }
    submitLockedRef.current = true;
    setSubmitLocked(true);
  }

  const slugDescribedBy = [
    slugHintId,
    state.fieldErrors?.slug ? slugErrorId : "",
  ]
    .filter(Boolean)
    .join(" ");
  const titleDescribedBy = state.fieldErrors?.title ? titleErrorId : undefined;

  return (
    <dialog
      ref={dialogRef}
      className="staffDialog templateDuplicateDialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={busy || undefined}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
    >
      <form action={formAction} onSubmit={onSubmit}>
        <div className="staffDialogHeader">
          <h2 id={titleId} className="staffDialogTitle">
            Duplicate template
          </h2>
        </div>
        <p id={descriptionId} className="staffDialogBody">
          {CANONICAL_DUPLICATE_DESCRIPTION}
        </p>
        <div className="staffDialogFields">
          <input
            type="hidden"
            name="sourceTemplateId"
            value={sourceTemplateId}
          />
          <input type="hidden" name="serviceCategory" value={serviceCategory} />
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor={titleFieldId}>
              New template title
            </label>
            <input
              ref={titleRef}
              id={titleFieldId}
              name="title"
              required
              maxLength={120}
              value={title}
              onChange={(event) => updateTitle(event.target.value)}
              className="staffField"
              aria-invalid={state.fieldErrors?.title ? true : undefined}
              aria-describedby={titleDescribedBy}
            />
            {state.fieldErrors?.title ? (
              <p id={titleErrorId} className="text-sm text-red-600">
                {state.fieldErrors.title}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor={slugFieldId}>
              New slug
            </label>
            <input
              id={slugFieldId}
              name="slug"
              required
              value={slug}
              onChange={(event) => {
                setSlugEdited(true);
                setSlug(event.target.value);
              }}
              className="staffField"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={state.fieldErrors?.slug ? true : undefined}
              aria-describedby={slugDescribedBy}
            />
            {slugEdited ? (
              <button
                type="button"
                className="staffBtn staffBtnQuiet w-fit"
                onClick={() => {
                  setSlugEdited(false);
                  setSlug(suggestGuideSlug(title));
                }}
              >
                Regenerate from title
              </button>
            ) : null}
            <p id={slugHintId} className="text-sm text-staff-muted">
              Lowercase letters, numbers, and hyphens. The slug extraction
              belongs to the Dental sample.
            </p>
            {state.fieldErrors?.slug ? (
              <p id={slugErrorId} className="text-sm text-red-600">
                {state.fieldErrors.slug}
              </p>
            ) : null}
          </div>
          <div className="templateDuplicateCategory">
            <p className="text-sm font-medium">Service category</p>
            <p className="templateDuplicateCategoryValue">
              {serviceCategoryLabel}
            </p>
            <p id={categoryHintId} className="text-sm text-staff-muted">
              Duplication stays in this service category.
            </p>
          </div>
          <TemplateClassificationField
            value={classification}
            onChange={setClassification}
            serviceCategory={serviceCategory}
            activeSample={classification === "SAMPLE" ? activeSample : null}
            error={state.fieldErrors?.classification}
          />
        </div>
        {state.error ? (
          <p
            id={formErrorId}
            className="staffDialogNote text-red-600"
            role="alert"
          >
            {state.error}
          </p>
        ) : null}
        <div className="sr-only" role="status" aria-live="polite">
          {busy ? "Duplicating template" : ""}
        </div>
        <div className="staffDialogActions">
          <button
            type="button"
            className="staffBtn staffBtnQuiet"
            disabled={busy}
            onClick={requestClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="staffBtn staffBtnPrimary staffLoginSubmit"
            disabled={!canDuplicate}
            aria-busy={busy || undefined}
          >
            {busy ? (
              <span className="staffLoginSpinner" aria-hidden="true" />
            ) : null}
            {busy ? "Duplicating…" : "Duplicate template"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
