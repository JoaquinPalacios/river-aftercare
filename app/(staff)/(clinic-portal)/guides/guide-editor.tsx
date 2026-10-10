"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  publishGuideAction,
  saveGuideDraftAction,
  type GuideActionState,
} from "@/app/(staff)/(clinic-portal)/guides/actions";
import { EditorLivePreview } from "@/app/(staff)/(clinic-portal)/guides/editor-live-preview";
import { GuideLifecycleActions } from "@/app/(staff)/(clinic-portal)/guides/guide-lifecycle-actions";
import { GuideShareMenu } from "@/app/(staff)/(clinic-portal)/guides/guide-share-menu";
import type { EditorSection } from "@/app/(staff)/(clinic-portal)/guides/timeline-accordion";
import { AutosizeTextarea } from "@/app/(staff)/components/autosize-textarea";
import { CanonicalGuideOutline } from "@/app/(staff)/components/canonical-guide-outline";
import { ConfirmDialog } from "@/app/(staff)/components/confirm-dialog";
import {
  Field,
  FieldError,
} from "@/app/(staff)/components/guide-section-editors";
import { GuideStatusPills } from "@/app/(staff)/components/guide-status-pills";
import { OrderedGuideSectionsEditor } from "@/app/(staff)/components/ordered-guide-sections-editor";
import { PortalBreadcrumb } from "@/app/(staff)/components/portal-breadcrumb";
import { SaveStatus } from "@/app/(staff)/components/save-status";
import { UnsavedChangesDialog } from "@/app/(staff)/components/unsaved-changes-dialog";
import { useUnsavedChangesGuard } from "@/app/(staff)/components/use-unsaved-changes-guard";
import { ExternalLinkIcon } from "@/app/(staff)/components/icons";
import { guideSectionKindLabel } from "@/lib/aftercare/guide-section-kind-label";
import { guideQrDownloadPath } from "@/lib/clinic-portal/guide-qr";
import { formSaveStatus } from "@/lib/clinic-portal/form-save-status";
import {
  clinicGuideOffersTimelineAddition,
  RECOVERY_TIMELINE_ABSENT_NOTE,
} from "@/lib/clinic-portal/guide-editor-timeline";
import {
  clinicGuideDestructiveAction,
  clinicGuideStatusPills,
  guideEditorPublicationMode,
} from "@/lib/clinic-portal/guide-status-view";
import type { PracticeGuideEditorRecord } from "@/lib/clinic-portal/load-practice-guide-editor";
import {
  SERVICE_CATEGORY_LABELS,
  serviceCategoryLabel,
  type ServiceCategory,
} from "@/lib/aftercare/service-category";

const emptyAction: GuideActionState = {};

function toEditorSections(
  sections: PracticeGuideEditorRecord["sections"]
): EditorSection[] {
  return sections.map((section) => ({
    key: section.key,
    kind: section.kind,
    title: section.title,
    body: section.body,
    periodLabel: section.periodLabel ?? "",
    startDay:
      typeof section.startDay === "number" ? String(section.startDay) : "",
    endDay: typeof section.endDay === "number" ? String(section.endDay) : "",
    homeCareInstructions: (section.homeCareInstructions ?? []).map((item) => ({
      key: item.key,
      title: item.title,
      body: item.body ?? "",
      frequencyCount:
        item.frequencyCount === null ? "" : String(item.frequencyCount),
      frequencyPeriod: item.frequencyPeriod ?? "",
      timingLabel: item.timingLabel ?? "",
      durationValue:
        item.durationValue === null ? "" : String(item.durationValue),
      durationUnit: item.durationUnit ?? "",
    })),
  }));
}

function optionalCount(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }
  return Number(value);
}

export function GuideEditor({
  guide,
  allowedServiceCategories = [],
  patientUrlExample,
  canEdit,
  retainedNotice = null,
  clinicThemeMode,
  fontClassName,
  fontCssVariable,
}: {
  guide: PracticeGuideEditorRecord;
  allowedServiceCategories?: ServiceCategory[];
  patientUrlExample: string;
  canEdit: boolean;
  retainedNotice?: string | null;
  clinicThemeMode?: string | null;
  fontClassName?: string;
  fontCssVariable?: `--font-clinic-${string}` | null;
}) {
  const router = useRouter();
  const errorSummaryRef = useRef<HTMLParagraphElement>(null);
  const pendingSnapshot = useRef<string>("");
  const focusNonce = useRef(0);
  const leaveAfterSave = useRef(false);
  const handledSave = useRef<GuideActionState | null>(null);
  const previewId = useId().replace(/:/g, "");
  const [leaving, setLeaving] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{
    key: string;
    nonce: number;
  } | null>(null);
  const [title, setTitle] = useState(guide.title);
  const [serviceCategory, setServiceCategory] = useState<string>(
    guide.serviceCategory ?? ""
  );
  const [publicSlug, setPublicSlug] = useState(guide.publicSlug);
  const [introduction, setIntroduction] = useState(guide.introduction ?? "");
  const [sections, setSections] = useState(() =>
    toEditorSections(guide.sections)
  );
  const [publishOpen, setPublishOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saveState, saveAction, saving] = useActionState(
    saveGuideDraftAction,
    emptyAction
  );
  const [publishState, publishAction, publishing] = useActionState(
    publishGuideAction,
    emptyAction
  );

  const serialized = useMemo(
    () =>
      JSON.stringify({
        title,
        publicSlug,
        introduction,
        sections,
        ...(guide.categoryEditable ? { serviceCategory } : {}),
      }),
    [
      title,
      publicSlug,
      introduction,
      sections,
      serviceCategory,
      guide.categoryEditable,
    ]
  );
  const serverSerialized = useMemo(
    () =>
      JSON.stringify({
        title: guide.title,
        publicSlug: guide.publicSlug,
        introduction: guide.introduction ?? "",
        sections: toEditorSections(guide.sections),
        ...(guide.categoryEditable
          ? { serviceCategory: guide.serviceCategory ?? "" }
          : {}),
      }),
    [guide]
  );
  const [confirmed, setConfirmed] = useState(serverSerialized);
  const dirty = serialized !== confirmed;
  const saveStatus = formSaveStatus({ dirty, pending: saving });
  const ignoreNextServerSnapshot = useRef(false);
  const {
    open: discardOpen,
    requestLeave,
    keepEditing,
    discard,
  } = useUnsavedChangesGuard(dirty);

  const hasTimeline = sections.some(
    (section) => section.kind === "RECOVERY_TIMELINE"
  );
  const allowTimelineAddition = clinicGuideOffersTimelineAddition({
    serviceCategory: guide.serviceCategory,
    publicSlug,
    title,
    templateTitle: guide.template?.title,
    sectionKinds: sections.map((section) => section.kind),
  });

  useEffect(() => {
    if (ignoreNextServerSnapshot.current) {
      ignoreNextServerSnapshot.current = false;
      return;
    }
    setConfirmed(serverSerialized);
  }, [serverSerialized]);

  useEffect(() => {
    if (handledSave.current === saveState) {
      return;
    }
    handledSave.current = saveState;
    if (saveState.error || saveState.fieldErrors) {
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
    setConfirmed(pendingSnapshot.current);
    if (leaveAfterSave.current) {
      leaveAfterSave.current = false;
      setLeaving(false);
      discard();
      return;
    }
    ignoreNextServerSnapshot.current = true;
    router.refresh();
  }, [saveState, discard, keepEditing, router]);

  useEffect(() => {
    if (publishState.ok) {
      router.refresh();
    }
  }, [publishState, router]);

  useEffect(() => {
    if (!saveState.error && !saveState.fieldErrors) {
      return;
    }
    const first = document.querySelector<HTMLElement>(
      "[data-guide-field][aria-invalid='true']"
    );
    if (first) {
      first.focus();
      return;
    }
    errorSummaryRef.current?.focus();
  }, [saveState]);

  function payloadSections(): unknown[] {
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
              frequencyCount: optionalCount(item.frequencyCount),
              frequencyPeriod: item.frequencyPeriod || null,
              timingLabel: item.timingLabel.trim() ? item.timingLabel : null,
              durationValue: optionalCount(item.durationValue),
              durationUnit: item.durationUnit || null,
            }))
          : [],
    }));
  }

  function saveAndLeave() {
    leaveAfterSave.current = true;
    setLeaving(true);
    pendingSnapshot.current = serialized;
    const form = document.getElementById(
      "guide-draft-form"
    ) as HTMLFormElement | null;
    form?.requestSubmit();
  }

  function revealSection(key: string) {
    focusNonce.current += 1;
    setFocusRequest({ key, nonce: focusNonce.current });
  }

  const categoryLabel = serviceCategoryLabel(guide.serviceCategory);
  const sourceLabel = [
    guide.template
      ? `Template · ${guide.template.title}`
      : guide.adaptedFromTemplate
        ? "Editable River template"
        : "Custom guide",
    categoryLabel,
  ]
    .filter(Boolean)
    .join(" · ");
  const statusPills = clinicGuideStatusPills(guide.lifecycle);
  const slugLocked = !canEdit || guide.isPublished;
  const publicUrl = patientUrlExample.startsWith("http")
    ? patientUrlExample
    : null;
  const showPublicLink =
    guide.isPublished && guide.isEnabled && Boolean(publicUrl);

  const publication = guideEditorPublicationMode({
    lifecycle: guide.lifecycle,
    dirty,
  });
  const actions = (
    <div className="staffEditorActions">
      <button
        type="button"
        className="staffBtn staffBtnQuiet"
        onClick={() => requestLeave("/guides")}
      >
        Cancel
      </button>
      {canEdit ? (
        <>
          <button
            type="submit"
            form="guide-draft-form"
            disabled={saving}
            className="staffBtn staffBtnSecondary"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {publication.publish ? (
            <button
              type="button"
              disabled={publishing || dirty}
              aria-describedby={dirty ? "guide-publish-needs-save" : undefined}
              title={
                dirty ? "Save the current draft before publishing." : undefined
              }
              className="staffBtn staffBtnPrimary"
              onClick={() => {
                setPublishOpen(true);
              }}
            >
              {publishing ? "Publishing…" : "Publish guide"}
            </button>
          ) : null}
          <GuideLifecycleActions
            guideId={guide.id}
            lifecycle={guide.lifecycle}
            destructiveAction={clinicGuideDestructiveAction(guide.lifecycle)}
            canUnpublish={publication.unpublish}
            unpublishPlacement="toolbar"
            unpublishDisabled={publishing}
            onDiscarded={(restored) => {
              const restoredSections = toEditorSections(restored.sections);
              setTitle(restored.title);
              setServiceCategory(guide.serviceCategory ?? "");
              setPublicSlug(restored.publicSlug);
              setIntroduction(restored.introduction);
              setSections(restoredSections);
              setConfirmed(
                JSON.stringify({
                  title: restored.title,
                  publicSlug: restored.publicSlug,
                  introduction: restored.introduction,
                  sections: restoredSections,
                  ...(guide.categoryEditable
                    ? { serviceCategory: guide.serviceCategory ?? "" }
                    : {}),
                })
              );
              ignoreNextServerSnapshot.current = true;
            }}
          />
        </>
      ) : null}
    </div>
  );

  const timelineStages = sections.filter(
    (section) => section.kind === "RECOVERY_TIMELINE"
  );
  const companionSections = sections
    .filter((section) => section.kind !== "RECOVERY_TIMELINE")
    .map((section) => ({
      key: section.key,
      title: section.title,
      kindLabel: guideSectionKindLabel(section.kind),
    }));
  const provenance = guide.template
    ? `Linked to the River template “${guide.template.title}”. Saving on this page does not adapt the guide or update a live demo.`
    : guide.adaptedFromTemplate
      ? "Clinic-owned copy of a River template. Edits stay on this guide and do not change the River template."
      : "Custom guide for this clinic.";
  const preview = (
    <EditorLivePreview
      stages={timelineStages}
      companionSections={companionSections}
      clinicThemeMode={clinicThemeMode}
      fontClassName={fontClassName}
      fontCssVariable={fontCssVariable}
    />
  );

  const saveFeedback = (
    <SaveStatus
      status={saveStatus}
      confirmSaved
      error={saveState.error ?? publishState.error}
      success={
        publishState.ok
          ? "Guide published. Patients now see this version."
          : saveState.ok && !dirty
            ? "Draft saved. The public guide is unchanged until you publish."
            : undefined
      }
    />
  );

  return (
    <div className="staffEditorPage staffGuideEditor">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <PortalBreadcrumb
          items={[
            { href: "/guides", label: "Guides" },
            { label: title || guide.title },
            { label: "Edit" },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          {showPublicLink && publicUrl ? (
            <>
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="staffBtn staffBtnQuiet"
              >
                View patient guide
                <span className="sr-only"> (opens in a new tab)</span>
                <ExternalLinkIcon className="ml-1" />
              </a>
              <GuideShareMenu
                publicUrl={publicUrl}
                svgHref={guideQrDownloadPath(guide.id, "svg")}
                pngHref={guideQrDownloadPath(guide.id, "png")}
              />
            </>
          ) : null}
          <Link
            href={`/guides/${guide.id}/preview`}
            className="staffBtn staffBtnQuiet"
          >
            Preview
          </Link>
        </div>
      </header>

      <div className="staffEditorToolbar">
        <div className="staffEditorToolbarStart">
          <div className="staffEditorIdentity">
            <h1 className="staffEditorToolbarTitle">
              {title || guide.title || "Edit guide"}
            </h1>
            <GuideStatusPills pills={statusPills} />
          </div>
          <p className="staffEditorToolbarContext">{sourceLabel}</p>
          <div className="staffEditorSaveStatus">
            {saveFeedback}
            {dirty && publication.publish ? (
              <p
                className="canonicalEditorEditNote"
                id="guide-publish-needs-save"
              >
                Save the current draft before publishing.
              </p>
            ) : null}
          </div>
        </div>
        <div className="staffEditorToolbarActions">{actions}</div>
      </div>

      <div className="staffEditorLayout">
        <form
          id="guide-draft-form"
          action={saveAction}
          className="flex flex-col gap-6"
          onSubmit={() => {
            pendingSnapshot.current = serialized;
          }}
        >
          <input type="hidden" name="guideId" value={guide.id} />
          <input
            type="hidden"
            name="sections"
            value={JSON.stringify(payloadSections())}
          />

          <section
            className="canonicalEditorBlock"
            data-guide-details=""
            data-block-accent="section"
            data-expanded="true"
          >
            <header className="canonicalBlockHeader">
              <h2 className="canonicalBlockHeading">
                <span className="canonicalBlockStatic">
                  <span className="canonicalBlockBadge">Guide</span>
                  <span className="canonicalBlockSummary">Guide details</span>
                </span>
              </h2>
            </header>
            <div className="canonicalBlockFields">
              <p className="text-sm text-staff-muted">{provenance}</p>
              <Field label="Guide title" htmlFor="title">
                <input
                  id="title"
                  name="title"
                  data-guide-field
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={!canEdit}
                  aria-invalid={saveState.fieldErrors?.title ? "true" : "false"}
                  aria-describedby={
                    saveState.fieldErrors?.title ? "title-error" : undefined
                  }
                  className="staffField"
                />
                <FieldError
                  id="title-error"
                  message={saveState.fieldErrors?.title}
                />
              </Field>
              {guide.categoryEditable ? (
                <Field label="Service" htmlFor="serviceCategory">
                  {allowedServiceCategories.length > 0 ? (
                    <select
                      id="serviceCategory"
                      name="serviceCategory"
                      value={serviceCategory}
                      onChange={(event) =>
                        setServiceCategory(event.target.value)
                      }
                      disabled={!canEdit}
                      aria-invalid={
                        saveState.fieldErrors?.serviceCategory
                          ? "true"
                          : "false"
                      }
                      aria-describedby={
                        saveState.fieldErrors?.serviceCategory
                          ? "serviceCategory-error"
                          : undefined
                      }
                      className="staffField"
                    >
                      {guide.serviceCategory ? null : (
                        <option value="">Not set</option>
                      )}
                      {[
                        ...new Set([
                          ...(guide.serviceCategory
                            ? [guide.serviceCategory]
                            : []),
                          ...allowedServiceCategories,
                        ]),
                      ].map((category) => (
                        <option key={category} value={category}>
                          {SERVICE_CATEGORY_LABELS[category]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p
                      id="serviceCategory"
                      className="text-sm text-staff-muted"
                    >
                      Configure a site service before changing this guide&apos;s
                      service.
                    </p>
                  )}
                  <FieldError
                    id="serviceCategory-error"
                    message={saveState.fieldErrors?.serviceCategory}
                  />
                </Field>
              ) : null}
              <Field label="Public slug" htmlFor="publicSlug">
                {slugLocked ? (
                  <input type="hidden" name="publicSlug" value={publicSlug} />
                ) : null}
                <input
                  id="publicSlug"
                  name={slugLocked ? undefined : "publicSlug"}
                  data-guide-field
                  value={publicSlug}
                  onChange={(event) => setPublicSlug(event.target.value)}
                  disabled={slugLocked}
                  aria-invalid={
                    saveState.fieldErrors?.publicSlug ? "true" : "false"
                  }
                  aria-describedby={
                    saveState.fieldErrors?.publicSlug
                      ? "publicSlug-error"
                      : undefined
                  }
                  className="staffField staffFieldNarrow"
                />
                <p className="staffEditorUrl text-sm text-staff-muted">
                  Patient URL:{" "}
                  {patientUrlExample.replace(
                    /\/[^/]*$/,
                    `/${publicSlug || "…"}`
                  )}
                </p>
                {guide.isPublished ? (
                  <p className="text-sm text-staff-muted">
                    The published public URL is protected so existing patient
                    links keep working.
                  </p>
                ) : null}
                <FieldError
                  id="publicSlug-error"
                  message={saveState.fieldErrors?.publicSlug}
                />
              </Field>
              <Field label="Short introduction" htmlFor="introduction">
                <AutosizeTextarea
                  id="introduction"
                  name="introduction"
                  data-guide-field
                  value={introduction}
                  onChange={(event) => setIntroduction(event.target.value)}
                  disabled={!canEdit}
                  aria-invalid={
                    saveState.fieldErrors?.introduction ? "true" : "false"
                  }
                  aria-describedby={
                    saveState.fieldErrors?.introduction
                      ? "introduction-note introduction-error"
                      : "introduction-note"
                  }
                />
                <p id="introduction-note" className="text-sm text-staff-muted">
                  For clinic reference. This text is not shown on the patient
                  page.
                </p>
                <FieldError
                  id="introduction-error"
                  message={saveState.fieldErrors?.introduction}
                />
              </Field>
            </div>
          </section>

          {hasTimeline ? null : (
            <p
              className="text-sm text-staff-muted"
              data-recovery-timeline="absent"
            >
              {RECOVERY_TIMELINE_ABSENT_NOTE}
            </p>
          )}
          <OrderedGuideSectionsEditor
            sections={sections}
            disabled={!canEdit}
            allowTimelineAddition={allowTimelineAddition}
            onChange={setSections}
            focusRequest={focusRequest}
          />

          {saveState.error || saveState.fieldErrors?.sections ? (
            <p
              ref={errorSummaryRef}
              className="text-sm text-red-600"
              role="alert"
              tabIndex={-1}
            >
              {saveState.error ?? saveState.fieldErrors?.sections}
            </p>
          ) : null}

          {retainedNotice ? (
            <p className="text-sm text-staff-muted" role="status">
              {retainedNotice}
            </p>
          ) : canEdit ? null : (
            <p className="text-sm text-staff-muted">
              Staff can view this guide but cannot edit it.
            </p>
          )}
        </form>

        <aside
          className="staffEditorRail"
          aria-label="Guide outline and patient preview"
        >
          <CanonicalGuideOutline sections={sections} onSelect={revealSection} />
          <div className="staffEditorRailDesktop">{preview}</div>
          <div className="staffEditorRailMobile">
            <div className="staffEditorPreviewToggle">
              <button
                type="button"
                className="staffBtn staffBtnSecondary w-full"
                aria-expanded={previewOpen}
                aria-controls={`mobile-preview-${previewId}`}
                onClick={() => setPreviewOpen((open) => !open)}
              >
                Preview patient guide
              </button>
            </div>
            {previewOpen ? (
              <div id={`mobile-preview-${previewId}`}>{preview}</div>
            ) : null}
          </div>
        </aside>
      </div>

      {canEdit ? (
        <form id="guide-publish-form" action={publishAction} className="hidden">
          <input type="hidden" name="guideId" value={guide.id} />
        </form>
      ) : null}

      <div className="staffEditorActionsMobile">{actions}</div>

      <UnsavedChangesDialog
        open={discardOpen}
        pending={leaving || saving}
        canSave={canEdit}
        onStay={keepEditing}
        onLeave={discard}
        onSave={saveAndLeave}
      />
      <ConfirmDialog
        open={publishOpen}
        title="Publish this guide?"
        description="Patients using the public guide will see this version. This publishes the saved draft."
        cancelLabel="Cancel"
        confirmLabel="Publish guide"
        confirmTone="primary"
        pending={publishing}
        pendingLabel="Publishing…"
        onCancel={() => {
          setPublishOpen(false);
        }}
        onConfirm={() => {
          const form = document.getElementById(
            "guide-publish-form"
          ) as HTMLFormElement | null;
          form?.requestSubmit();
          setPublishOpen(false);
        }}
      />
    </div>
  );
}
