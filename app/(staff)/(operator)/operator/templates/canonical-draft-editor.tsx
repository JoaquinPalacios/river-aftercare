"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { CanonicalEditorToolbar } from "@/app/(staff)/components/canonical-editor-toolbar";
import { CanonicalGuideOutline } from "@/app/(staff)/components/canonical-guide-outline";
import { CanonicalGuidePreview } from "@/app/(staff)/components/canonical-guide-preview";
import { ConfirmDialog } from "@/app/(staff)/components/confirm-dialog";
import { UnsavedChangesDialog } from "@/app/(staff)/components/unsaved-changes-dialog";
import { useUnsavedChangesGuard } from "@/app/(staff)/components/use-unsaved-changes-guard";
import { EditorSectionHeading } from "@/app/(staff)/components/guide-section-editors";
import { OrderedGuideSectionsEditor } from "@/app/(staff)/components/ordered-guide-sections-editor";
import { TemplateLifecycleActions } from "@/app/(staff)/(operator)/operator/templates/template-lifecycle-actions";
import type { EditorSection } from "@/app/(staff)/(clinic-portal)/guides/timeline-accordion";
import {
  createCanonicalTemplateDraftAction,
  publishCanonicalTemplateRevisionAction,
  saveCanonicalTemplateDraftAction,
  type CanonicalTemplateActionState,
} from "@/app/(staff)/(operator)/operator/templates/actions";
import {
  canonicalDraftContentChanged,
  canonicalEditorContentSignature,
} from "@/lib/aftercare/canonical-editor-content";
import { editorSectionsToComposedGuide } from "@/lib/aftercare/editor-sections-to-document";

const initial: CanonicalTemplateActionState = {};

type CanonicalWorkspaceProps = {
  templateId: string;
  templateTitle: string;
  initialSections: EditorSection[];
  isActive: boolean;
} & (
  | {
      mode?: "draft";
      revisionId: string;
      version: number;
      savedContentSignature: string;
      neverPublished: boolean;
    }
  | {
      mode: "published";
    }
);

export function CanonicalDraftEditor(props: CanonicalWorkspaceProps) {
  const published = props.mode === "published";
  const templateId = props.templateId;
  const templateTitle = props.templateTitle;
  const initialSections = props.initialSections;
  const isActive = props.isActive;
  const revisionId = published ? "" : props.revisionId;
  const version = published ? 0 : props.version;
  const savedContentSignature = published ? "" : props.savedContentSignature;
  const neverPublished = published ? false : props.neverPublished;
  const router = useRouter();
  const focusNonce = useRef(0);
  const [sections, setSections] = useState(initialSections);
  const [publishOpen, setPublishOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{
    key: string;
    nonce: number;
  } | null>(null);
  const loadedKey = published
    ? `published:${initialSections.map((section) => section.key).join("|")}`
    : `${revisionId}:${savedContentSignature}`;
  const [seenKey, setSeenKey] = useState(loadedKey);
  const [confirmedSignature, setConfirmedSignature] = useState(
    savedContentSignature
  );
  const sectionsRef = useRef(sections);
  const leaveAfterSave = useRef(false);
  const handledSave = useRef<CanonicalTemplateActionState | null>(null);
  const [leaving, setLeaving] = useState(false);
  if (seenKey !== loadedKey) {
    setSeenKey(loadedKey);
    setSections(initialSections);
    setConfirmedSignature(savedContentSignature);
  }
  sectionsRef.current = sections;

  const [saveState, saveAction, saving] = useActionState(
    saveCanonicalTemplateDraftAction,
    initial
  );
  const [publishState, publishAction, publishing] = useActionState(
    publishCanonicalTemplateRevisionAction,
    initial
  );
  const [createState, createAction, creating] = useActionState(
    createCanonicalTemplateDraftAction,
    initial
  );

  const contentChanged =
    !published && canonicalDraftContentChanged(confirmedSignature, sections);
  const {
    open: leaveOpen,
    keepEditing,
    discard,
  } = useUnsavedChangesGuard(contentChanged);
  const previewSections = useMemo(
    () => editorSectionsToComposedGuide(sections),
    [sections]
  );

  useEffect(() => {
    if (handledSave.current === saveState) {
      return;
    }
    handledSave.current = saveState;
    if (saveState.error) {
      if (leaveAfterSave.current) {
        leaveAfterSave.current = false;
        setLeaving(false);
        keepEditing();
      }
      return;
    }
    if (!saveState.ok) {
      return;
    }
    setConfirmedSignature(canonicalEditorContentSignature(sectionsRef.current));
    if (leaveAfterSave.current) {
      leaveAfterSave.current = false;
      setLeaving(false);
      discard();
      return;
    }
    router.refresh();
  }, [saveState, discard, keepEditing, router]);

  function saveAndLeave() {
    leaveAfterSave.current = true;
    setLeaving(true);
    const form = document.getElementById(
      "canonical-draft-form"
    ) as HTMLFormElement | null;
    form?.requestSubmit();
  }

  function revealSection(key: string) {
    focusNonce.current += 1;
    setFocusRequest({ key, nonce: focusNonce.current });
  }

  return (
    <div
      className="canonicalDraftEditor flex flex-col gap-6"
      data-template-workspace={published ? "published" : "draft"}
    >
      <CanonicalEditorToolbar
        templateId={templateId}
        templateTitle={templateTitle}
        mode={published ? "published" : "draft"}
        contentChanged={published ? false : contentChanged}
        saving={saving}
        publishing={publishing}
        editing={creating}
        isActive={isActive}
        onPublish={() => {
          if (!contentChanged) {
            setPublishOpen(true);
          }
        }}
        lifecycle={
          <TemplateLifecycleActions
            templateId={templateId}
            draftId={published ? null : revisionId}
            neverPublished={neverPublished}
            isActive={isActive}
            canCreateRevision={false}
            presentation="menu"
          />
        }
      />
      {published ? null : saveState.ok ? (
        <p className="text-sm text-staff-muted" role="status">
          Saved.
        </p>
      ) : null}
      {createState.error ? (
        <p className="text-sm text-red-600" role="alert">
          {createState.error}
        </p>
      ) : null}
      <div className="canonicalEditorColumns">
        <div className="canonicalEditorMain">
          {published ? (
            <EditorSectionHeading title="Published content">
              <OrderedGuideSectionsEditor
                sections={sections}
                disabled
                onChange={() => undefined}
                focusRequest={focusRequest}
              />
            </EditorSectionHeading>
          ) : (
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
          )}
        </div>
        <CanonicalGuideOutline sections={sections} onSelect={revealSection} />
      </div>
      <CanonicalGuidePreview sections={previewSections} />
      {published ? (
        <form
          id="create-published-revision-form"
          action={createAction}
          className="hidden"
        >
          <input type="hidden" name="templateId" value={templateId} />
        </form>
      ) : (
        <form
          id="publish-revision-form"
          action={publishAction}
          className="hidden"
        >
          <input type="hidden" name="templateId" value={templateId} />
          <input type="hidden" name="revisionId" value={revisionId} />
          <input type="hidden" name="expectedVersion" value={String(version)} />
        </form>
      )}
      {published ? null : (
        <UnsavedChangesDialog
          open={leaveOpen}
          pending={leaving}
          onStay={keepEditing}
          onLeave={discard}
          onSave={saveAndLeave}
        />
      )}
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
