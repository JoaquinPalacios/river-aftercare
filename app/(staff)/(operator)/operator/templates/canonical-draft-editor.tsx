"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { CanonicalEditorToolbar } from "@/app/(staff)/components/canonical-editor-toolbar";
import { CanonicalGuideOutline } from "@/app/(staff)/components/canonical-guide-outline";
import { CanonicalGuidePreview } from "@/app/(staff)/components/canonical-guide-preview";
import { ConfirmDialog } from "@/app/(staff)/components/confirm-dialog";
import { EditorSectionHeading } from "@/app/(staff)/components/guide-section-editors";
import { OrderedGuideSectionsEditor } from "@/app/(staff)/components/ordered-guide-sections-editor";
import { TemplateLifecycleActions } from "@/app/(staff)/(operator)/operator/templates/template-lifecycle-actions";
import type { EditorSection } from "@/app/(staff)/(clinic-portal)/guides/timeline-accordion";
import {
  publishCanonicalTemplateRevisionAction,
  saveCanonicalTemplateDraftAction,
  type CanonicalTemplateActionState,
} from "@/app/(staff)/(operator)/operator/templates/actions";
import { canonicalDraftContentChanged } from "@/lib/aftercare/canonical-editor-content";
import { editorSectionsToComposedGuide } from "@/lib/aftercare/editor-sections-to-document";

const initial: CanonicalTemplateActionState = {};

export function CanonicalDraftEditor({
  templateId,
  templateTitle,
  revisionId,
  version,
  savedContentSignature,
  initialSections,
  isActive,
  neverPublished,
}: {
  templateId: string;
  templateTitle: string;
  revisionId: string;
  version: number;
  savedContentSignature: string;
  initialSections: EditorSection[];
  isActive: boolean;
  neverPublished: boolean;
}) {
  const router = useRouter();
  const focusNonce = useRef(0);
  const [sections, setSections] = useState(initialSections);
  const [publishOpen, setPublishOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{
    key: string;
    nonce: number;
  } | null>(null);
  const loadedKey = `${revisionId}:${savedContentSignature}`;
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
  const previewSections = useMemo(
    () => editorSectionsToComposedGuide(sections),
    [sections]
  );

  useEffect(() => {
    if (saveState.ok) {
      router.refresh();
    }
  }, [saveState.ok, router]);

  function revealSection(key: string) {
    focusNonce.current += 1;
    setFocusRequest({ key, nonce: focusNonce.current });
  }

  return (
    <div className="canonicalDraftEditor flex flex-col gap-6">
      <CanonicalEditorToolbar
        templateId={templateId}
        templateTitle={templateTitle}
        contentChanged={contentChanged}
        saving={saving}
        publishing={publishing}
        isActive={isActive}
        onPublish={() => setPublishOpen(true)}
        lifecycle={
          <TemplateLifecycleActions
            templateId={templateId}
            draftId={revisionId}
            neverPublished={neverPublished}
            isActive={isActive}
            canCreateRevision={false}
            presentation="menu"
          />
        }
      />
      {saveState.ok ? (
        <p className="text-sm text-staff-muted" role="status">
          Saved.
        </p>
      ) : null}
      <div className="canonicalEditorColumns">
        <div className="canonicalEditorMain">
          <form
            id="canonical-draft-form"
            action={saveAction}
            className="flex flex-col gap-6"
          >
            <input type="hidden" name="templateId" value={templateId} />
            <input type="hidden" name="revisionId" value={revisionId} />
            <input
              type="hidden"
              name="sections"
              value={JSON.stringify(sectionsPayload(sections))}
            />
            <EditorSectionHeading title="Draft content">
              <OrderedGuideSectionsEditor
                sections={sections}
                disabled={false}
                onChange={setSections}
                focusRequest={focusRequest}
              />
            </EditorSectionHeading>
            {saveState.error ? (
              <p className="text-sm text-red-600" role="alert">
                {saveState.error}
              </p>
            ) : null}
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
          </form>
        </div>
        <CanonicalGuideOutline sections={sections} onSelect={revealSection} />
      </div>
      <CanonicalGuidePreview sections={previewSections} />
      <form
        id="publish-revision-form"
        action={publishAction}
        className="hidden"
      >
        <input type="hidden" name="templateId" value={templateId} />
        <input type="hidden" name="revisionId" value={revisionId} />
        <input type="hidden" name="expectedVersion" value={String(version)} />
      </form>
      <ConfirmDialog
        open={publishOpen}
        title="Publish this revision?"
        description="The revision becomes immutable. Eligible clinics may discover this template. Clinics already pinned to an earlier revision are not updated."
        cancelLabel="Cancel"
        confirmLabel="Publish"
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
