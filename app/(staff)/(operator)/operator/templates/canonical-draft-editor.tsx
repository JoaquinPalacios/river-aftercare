"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { CanonicalGuidePreview } from "@/app/(staff)/components/canonical-guide-preview";
import { ConfirmDialog } from "@/app/(staff)/components/confirm-dialog";
import { EditorSectionHeading } from "@/app/(staff)/components/guide-section-editors";
import { OrderedGuideSectionsEditor } from "@/app/(staff)/components/ordered-guide-sections-editor";
import { RecordReviewForm } from "@/app/(staff)/(operator)/operator/templates/record-review-form";
import type { EditorSection } from "@/app/(staff)/(clinic-portal)/guides/timeline-accordion";
import {
  publishCanonicalTemplateRevisionAction,
  saveCanonicalTemplateDraftAction,
  type CanonicalTemplateActionState,
} from "@/app/(staff)/(operator)/operator/templates/actions";
import {
  canonicalDraftContentChanged,
  REVIEW_INVALIDATION_WARNING,
} from "@/lib/aftercare/canonical-editor-content";
import { editorSectionsToComposedGuide } from "@/lib/aftercare/editor-sections-to-document";

const initial: CanonicalTemplateActionState = {};

export function CanonicalDraftEditor({
  templateId,
  revisionId,
  version,
  reviewed,
  reviewSummary,
  savedContentSignature,
  initialSections,
  isActive,
  reviewerName,
  reviewerCredential,
  reviewNote,
}: {
  templateId: string;
  revisionId: string;
  version: number;
  reviewed: boolean;
  reviewSummary: {
    reviewerName: string;
    reviewerCredential: string | null;
    reviewNote: string | null;
    reviewedAtLabel: string | null;
    recordedByLabel: string | null;
  } | null;
  savedContentSignature: string;
  initialSections: EditorSection[];
  isActive: boolean;
  reviewerName: string;
  reviewerCredential: string;
  reviewNote: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const allowReviewedSave = useRef(false);
  const [sections, setSections] = useState(initialSections);
  const [warnOpen, setWarnOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const loadedKey = `${revisionId}:${savedContentSignature}:${reviewed ? "reviewed" : "open"}`;
  const [seenKey, setSeenKey] = useState(loadedKey);
  if (seenKey !== loadedKey) {
    setSeenKey(loadedKey);
    setSections(initialSections);
  }

  const [saveState, saveAction, saving] = useActionState(
    saveCanonicalTemplateDraftAction,
    initial
  );
  const [publishState, publishAction, publishing] = useActionState(
    publishCanonicalTemplateRevisionAction,
    initial
  );

  const contentChanged = useMemo(
    () => canonicalDraftContentChanged(savedContentSignature, sections),
    [savedContentSignature, sections]
  );
  const invalidationWarningId =
    reviewed && contentChanged ? "draft-review-invalidation" : undefined;
  const previewSections = useMemo(
    () => editorSectionsToComposedGuide(sections),
    [sections]
  );

  useEffect(() => {
    if (saveState.ok) {
      router.refresh();
    }
  }, [saveState.ok, saveState.reviewCleared, router]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="staffStatusPill" data-tone="draft">
          Draft v{version}
        </span>
        {reviewed ? (
          <span className="staffStatusPill" data-tone="success">
            Review recorded
          </span>
        ) : (
          <span className="staffStatusPill" data-tone="warning">
            Not reviewed
          </span>
        )}
        {isActive ? null : (
          <span className="staffStatusPill" data-tone="inactive">
            Inactive
          </span>
        )}
      </div>
      {reviewed ? null : (
        <p className="text-sm text-staff-muted">
          This draft is not reviewed. Record review before publication.
        </p>
      )}
      {reviewed && contentChanged ? (
        <p
          id="draft-review-invalidation"
          className="text-sm text-red-700"
          role="status"
        >
          {REVIEW_INVALIDATION_WARNING}
        </p>
      ) : null}
      {saveState.reviewCleared ? (
        <p className="text-sm text-red-700" role="status">
          The recorded review was cleared because the draft content changed.
          Record review again before publication.
        </p>
      ) : null}
      {saveState.ok && !saveState.reviewCleared ? (
        <p className="text-sm text-staff-muted" role="status">
          Draft saved.
        </p>
      ) : null}
      <form
        ref={formRef}
        id="canonical-draft-form"
        action={saveAction}
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          if (reviewed && contentChanged && !allowReviewedSave.current) {
            event.preventDefault();
            setWarnOpen(true);
            return;
          }
          allowReviewedSave.current = false;
        }}
      >
        <input type="hidden" name="templateId" value={templateId} />
        <input type="hidden" name="revisionId" value={revisionId} />
        <input
          type="hidden"
          name="sections"
          value={JSON.stringify(sectionsPayload(sections))}
        />
        <EditorSectionHeading title="Draft content">
          <button
            type="submit"
            className="staffBtn staffBtnPrimary w-fit"
            data-draft-save="top"
            disabled={saving}
            aria-describedby={invalidationWarningId}
          >
            {saving ? "Saving…" : "Save draft"}
          </button>
          <OrderedGuideSectionsEditor
            sections={sections}
            disabled={false}
            onChange={setSections}
          />
        </EditorSectionHeading>
        {saveState.error ? (
          <p className="text-sm text-red-600" role="alert">
            {saveState.error}
          </p>
        ) : null}
        <button
          type="submit"
          className="staffBtn staffBtnPrimary w-fit"
          data-draft-save="bottom"
          disabled={saving}
          aria-describedby={invalidationWarningId}
        >
          {saving ? "Saving…" : "Save draft"}
        </button>
      </form>
      <CanonicalGuidePreview sections={previewSections} />
      <EditorSectionHeading
        title={reviewed ? "Review recorded" : "Record review"}
      >
        <p className="text-sm text-staff-muted">
          Recording review does not publish the revision. Publishing makes a
          reviewed revision available to eligible clinics.
        </p>
        {reviewed && reviewSummary ? (
          <div className="rounded-xl border border-staff-line bg-staff-canvas p-4 text-sm">
            <p>
              {reviewSummary.reviewerName}
              {reviewSummary.reviewerCredential
                ? ` · ${reviewSummary.reviewerCredential}`
                : ""}
            </p>
            {reviewSummary.reviewNote ? (
              <p className="mt-2 text-staff-muted">
                {reviewSummary.reviewNote}
              </p>
            ) : null}
            <p className="mt-2 text-staff-muted">
              {reviewSummary.reviewedAtLabel ?? "Review time unavailable"}
              {reviewSummary.recordedByLabel
                ? ` · Recorded by ${reviewSummary.recordedByLabel}`
                : ""}
            </p>
          </div>
        ) : null}
        <RecordReviewForm
          templateId={templateId}
          revisionId={revisionId}
          reviewerName={reviewerName}
          reviewerCredential={reviewerCredential}
          reviewNote={reviewNote}
          reviewed={reviewed}
        />
      </EditorSectionHeading>
      <EditorSectionHeading title="Publish revision">
        <div className="flex flex-col gap-3">
          <button
            type="button"
            className="staffBtn staffBtnPrimary w-fit"
            disabled={!reviewed || publishing}
            onClick={() => setPublishOpen(true)}
          >
            Publish revision
          </button>
          {reviewed ? null : (
            <p className="text-sm text-staff-muted">
              Record a complete review before publishing this revision.
            </p>
          )}
          {isActive ? null : (
            <p className="text-sm text-staff-muted">
              Activate this template before publishing.
            </p>
          )}
          {publishState.error ? (
            <p className="text-sm text-red-600" role="alert">
              {publishState.error}
            </p>
          ) : null}
        </div>
      </EditorSectionHeading>
      <form
        id="publish-revision-form"
        action={publishAction}
        className="hidden"
      >
        <input type="hidden" name="templateId" value={templateId} />
        <input type="hidden" name="revisionId" value={revisionId} />
        <input type="hidden" name="expectedVersion" value={String(version)} />
      </form>
      {warnOpen ? (
        <ConfirmDialog
          open
          title="Save changes to reviewed content?"
          description={REVIEW_INVALIDATION_WARNING}
          cancelLabel="Keep editing"
          confirmLabel="Save and clear review"
          confirmTone="danger"
          pending={saving}
          pendingLabel="Saving…"
          onCancel={() => setWarnOpen(false)}
          onConfirm={() => {
            allowReviewedSave.current = true;
            setWarnOpen(false);
            formRef.current?.requestSubmit();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={publishOpen}
        title="Publish this revision?"
        description="The revision becomes immutable. Eligible clinics may discover this template. Clinics already pinned to an earlier revision are not updated."
        cancelLabel="Cancel"
        confirmLabel="Publish revision"
        confirmTone="primary"
        pending={publishing}
        pendingLabel="Publishing…"
        onCancel={() => setPublishOpen(false)}
        onConfirm={() => {
          const form = document.getElementById(
            "publish-revision-form"
          ) as HTMLFormElement | null;
          form?.requestSubmit();
          setPublishOpen(false);
        }}
      />
    </div>
  );
}

function sectionsPayload(sections: EditorSection[]) {
  return sections.map((section) => ({
    key: section.key,
    kind: section.kind,
    title: section.title,
    body: section.body,
    periodLabel: section.periodLabel || null,
    startDay: section.startDay === "" ? null : Number(section.startDay),
    endDay: section.endDay === "" ? null : Number(section.endDay),
    homeCareInstructions:
      section.kind === "HOME_CARE_PLAN"
        ? section.homeCareInstructions.map((item) => ({
            key: item.key,
            title: item.title,
            body: item.body.trim() ? item.body : null,
            frequencyCount:
              item.frequencyCount.trim() === ""
                ? null
                : Number(item.frequencyCount),
            frequencyPeriod: item.frequencyPeriod || null,
            timingLabel: item.timingLabel.trim() ? item.timingLabel : null,
            durationValue:
              item.durationValue.trim() === ""
                ? null
                : Number(item.durationValue),
            durationUnit: item.durationUnit || null,
          }))
        : [],
  }));
}
