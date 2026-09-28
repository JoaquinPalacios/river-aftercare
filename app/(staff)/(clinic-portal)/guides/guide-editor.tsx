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
import {
  TimelineAccordion,
  type EditorSection,
} from "@/app/(staff)/(clinic-portal)/guides/timeline-accordion";
import { AutosizeTextarea } from "@/app/(staff)/components/autosize-textarea";
import { ConfirmDialog } from "@/app/(staff)/components/confirm-dialog";
import {
  EditorSectionHeading,
  Field,
  FieldError,
  GenericSectionEditor,
  HomeCarePlanEditor,
  newGuideContentKey,
} from "@/app/(staff)/components/guide-section-editors";
import { GuideStatusPills } from "@/app/(staff)/components/guide-status-pills";
import { PortalBreadcrumb } from "@/app/(staff)/components/portal-breadcrumb";
import { SaveStatus } from "@/app/(staff)/components/save-status";
import { useUnsavedChangesGuard } from "@/app/(staff)/components/use-unsaved-changes-guard";
import { ExternalLinkIcon } from "@/app/(staff)/components/icons";
import { guideQrDownloadPath } from "@/lib/clinic-portal/guide-qr";
import { formSaveStatus } from "@/lib/clinic-portal/form-save-status";
import { formatPortalDateTime } from "@/lib/clinic-portal/format-portal-date";
import {
  clinicGuideDestructiveAction,
  clinicGuideStatusPills,
  guideEditorPublicationMode,
} from "@/lib/clinic-portal/guide-status-view";
import type { PracticeGuideEditorRecord } from "@/lib/clinic-portal/load-practice-guide-editor";
import { PRACTICE_REVIEW_ATTESTATION_LABEL } from "@/lib/clinic-portal/practice-review-attestation";
import type {
  HomeCareDurationUnit,
  HomeCareFrequencyPeriod,
} from "@/lib/aftercare/home-care-instruction";
import {
  SERVICE_CATEGORY_LABELS,
  serviceCategoryLabel,
  type ServiceCategory,
} from "@/lib/aftercare/service-category";
import type { GuideSectionKind } from "@/lib/aftercare/types";

const ADDITIONAL_KINDS: GuideSectionKind[] = [
  "INTRODUCTION",
  "IMMEDIATE_CARE",
  "FIRST_24_HOURS",
  "WHAT_IS_NORMAL",
  "PAIN",
  "RESTRICTIONS",
  "MEDICATIONS",
  "SITE_CARE",
  "WHAT_TO_AVOID",
  "CUSTOM",
];

const WARNING_KINDS: GuideSectionKind[] = [
  "WARNING_SIGNS",
  "CONTACT_PRACTICE",
  "EMERGENCY",
];

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
  requiresReviewAttestation = true,
  clinicThemeMode,
  fontClassName,
  fontCssVariable,
}: {
  guide: PracticeGuideEditorRecord;
  allowedServiceCategories?: ServiceCategory[];
  patientUrlExample: string;
  canEdit: boolean;
  retainedNotice?: string | null;
  requiresReviewAttestation?: boolean;
  clinicThemeMode?: string | null;
  fontClassName?: string;
  fontCssVariable?: `--font-clinic-${string}` | null;
}) {
  const router = useRouter();
  const errorSummaryRef = useRef<HTMLParagraphElement>(null);
  const pendingSnapshot = useRef<string>("");
  const previewId = useId().replace(/:/g, "");
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
  const [reviewAttested, setReviewAttested] = useState(false);
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

  const timeline = sections.filter(
    (section) => section.kind === "RECOVERY_TIMELINE"
  );
  const additional = sections.filter((section) =>
    ADDITIONAL_KINDS.includes(section.kind)
  );
  const homeCare = sections.filter(
    (section) => section.kind === "HOME_CARE_PLAN"
  );
  const warnings = sections.filter((section) =>
    WARNING_KINDS.includes(section.kind)
  );
  const [expandedStageKey, setExpandedStageKey] = useState<string | null>(
    () => timeline[0]?.key ?? null
  );

  useEffect(() => {
    if (ignoreNextServerSnapshot.current) {
      ignoreNextServerSnapshot.current = false;
      return;
    }
    setConfirmed(serverSerialized);
  }, [serverSerialized]);

  useEffect(() => {
    if (saveState.ok) {
      setConfirmed(pendingSnapshot.current);
      ignoreNextServerSnapshot.current = true;
      router.refresh();
    }
  }, [saveState, router]);

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

  function replaceGroup(
    predicate: (section: EditorSection) => boolean,
    nextGroup: EditorSection[]
  ) {
    setSections((current) => [
      ...current.filter((section) => !predicate(section)),
      ...nextGroup,
    ]);
  }

  function payloadSections(): unknown[] {
    return [...timeline, ...additional, ...homeCare, ...warnings].map(
      (section) => ({
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
      })
    );
  }

  function addStage() {
    const key = newGuideContentKey("stage");
    replaceGroup(
      (section) => section.kind === "RECOVERY_TIMELINE",
      [
        ...timeline,
        {
          key,
          kind: "RECOVERY_TIMELINE",
          title: "New stage",
          body: "Add recovery instructions for this period.",
          periodLabel: "",
          startDay: "",
          endDay: "",
          homeCareInstructions: [],
        },
      ]
    );
    setExpandedStageKey(key);
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
            {saving ? "Saving…" : "Save draft"}
          </button>
          {publication.publish ? (
            <button
              type="button"
              disabled={publishing || dirty}
              title={
                dirty ? "Save the current draft before publishing." : undefined
              }
              className="staffBtn staffBtnPrimary"
              onClick={() => {
                setReviewAttested(false);
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

  const preview = (
    <EditorLivePreview
      stages={timeline}
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
          <p className="staffEditorToolbarContext">
            {sourceLabel}
            {guide.reviewAttestation ? (
              <>
                {" · "}
                Clinical review confirmed by{" "}
                {guide.reviewAttestation.confirmedByLabel}
                {" · "}
                {formatPortalDateTime(guide.reviewAttestation.confirmedAt)}
              </>
            ) : null}
          </p>
          <div className="staffEditorSaveStatus">{saveFeedback}</div>
        </div>
        <div className="staffEditorToolbarActions">{actions}</div>
      </div>

      <div className="staffEditorLayout">
        <form
          id="guide-draft-form"
          action={saveAction}
          className="flex flex-col gap-8"
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

          <EditorSectionHeading title="Basics">
            <Field label="Guide title" htmlFor="title">
              <input
                id="title"
                name="title"
                data-guide-field
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={!canEdit}
                aria-invalid={saveState.fieldErrors?.title ? "true" : "false"}
                className="staffField"
              />
              <FieldError message={saveState.fieldErrors?.title} />
            </Field>
            {guide.categoryEditable ? (
              <Field label="Service" htmlFor="serviceCategory">
                {allowedServiceCategories.length > 0 ? (
                  <select
                    id="serviceCategory"
                    name="serviceCategory"
                    value={serviceCategory}
                    onChange={(event) => setServiceCategory(event.target.value)}
                    disabled={!canEdit}
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
                  <p id="serviceCategory" className="text-sm text-staff-muted">
                    Configure a site service before changing this guide&apos;s
                    service.
                  </p>
                )}
                <FieldError message={saveState.fieldErrors?.serviceCategory} />
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
                className="staffField staffFieldNarrow"
              />
              <p className="staffEditorUrl text-sm text-staff-muted">
                Patient URL:{" "}
                {patientUrlExample.replace(/\/[^/]*$/, `/${publicSlug || "…"}`)}
              </p>
              {guide.isPublished ? (
                <p className="text-sm text-staff-muted">
                  The published public URL is protected so existing patient
                  links keep working.
                </p>
              ) : null}
              <FieldError message={saveState.fieldErrors?.publicSlug} />
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
              />
              <FieldError message={saveState.fieldErrors?.introduction} />
            </Field>
          </EditorSectionHeading>

          <EditorSectionHeading title="Timeline">
            <TimelineAccordion
              stages={timeline}
              disabled={!canEdit}
              expandedKey={expandedStageKey}
              onExpandedKeyChange={setExpandedStageKey}
              onChange={(next) =>
                replaceGroup(
                  (section) => section.kind === "RECOVERY_TIMELINE",
                  next
                )
              }
            />
            {canEdit ? (
              <button
                type="button"
                onClick={addStage}
                className="staffBtn staffBtnSecondary self-start"
              >
                Add stage
              </button>
            ) : null}
          </EditorSectionHeading>

          <EditorSectionHeading title="Additional guidance">
            <GenericSectionEditor
              sections={additional}
              kinds={ADDITIONAL_KINDS}
              disabled={!canEdit}
              addLabel="Add guidance"
              onChange={(next) =>
                replaceGroup(
                  (section) => ADDITIONAL_KINDS.includes(section.kind),
                  next
                )
              }
            />
          </EditorSectionHeading>

          <EditorSectionHeading title="Home care plan">
            <p className="text-sm text-staff-muted">
              Recurring or milestone instructions. Leave frequency blank when an
              instruction only needs a duration, such as a review in a set
              number of weeks.
            </p>
            <HomeCarePlanEditor
              sections={homeCare}
              disabled={!canEdit}
              onChange={(next) =>
                replaceGroup(
                  (section) => section.kind === "HOME_CARE_PLAN",
                  next
                )
              }
            />
          </EditorSectionHeading>

          <EditorSectionHeading title="Warnings / contact">
            <GenericSectionEditor
              sections={warnings}
              kinds={WARNING_KINDS}
              disabled={!canEdit}
              addLabel="Add warning or contact section"
              onChange={(next) =>
                replaceGroup(
                  (section) => WARNING_KINDS.includes(section.kind),
                  next
                )
              }
            />
          </EditorSectionHeading>

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
          aria-label="Patient timeline preview"
        >
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
                Preview patient timeline
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
          <input
            type="hidden"
            name="reviewAttested"
            value={
              requiresReviewAttestation && reviewAttested ? "true" : "false"
            }
          />
        </form>
      ) : null}

      <div className="staffEditorActionsMobile">{actions}</div>

      <ConfirmDialog
        open={discardOpen}
        title="Discard unsaved changes?"
        description="Your latest changes haven't been saved."
        cancelLabel="Keep editing"
        confirmLabel="Discard changes"
        confirmTone="danger"
        onCancel={keepEditing}
        onConfirm={discard}
      />
      <ConfirmDialog
        open={publishOpen}
        title="Publish this guide?"
        description="Patients using the public guide will see this version."
        cancelLabel="Cancel"
        confirmLabel="Publish guide"
        confirmTone="primary"
        confirmDisabled={requiresReviewAttestation && !reviewAttested}
        onCancel={() => {
          setPublishOpen(false);
          setReviewAttested(false);
        }}
        onConfirm={() => {
          const form = document.getElementById(
            "guide-publish-form"
          ) as HTMLFormElement | null;
          form?.requestSubmit();
          setPublishOpen(false);
        }}
      >
        {requiresReviewAttestation ? (
          <label className="staffDialogCheck">
            <input
              type="checkbox"
              checked={reviewAttested}
              onChange={(event) => setReviewAttested(event.target.checked)}
            />
            <span>{PRACTICE_REVIEW_ATTESTATION_LABEL}</span>
          </label>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
