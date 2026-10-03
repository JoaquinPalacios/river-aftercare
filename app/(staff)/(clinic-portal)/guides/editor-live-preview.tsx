"use client";

import { useState } from "react";

import { PatientThemeBoundary } from "@/app/(aftercare)/components/patient-theme-boundary";
import { RecoveryTimelineList } from "@/app/(aftercare)/components/recovery-timeline-list";
import { PatientPreviewAppearanceSelect } from "@/app/(staff)/components/patient-preview-appearance-select";
import { usePortalThemePreference } from "@/app/(staff)/components/use-portal-theme-preference";
import { editorStagesToPreviewSections } from "@/lib/clinic-portal/editor-preview-sections";
import { RECOVERY_TIMELINE_ABSENT_NOTE } from "@/lib/clinic-portal/guide-editor-timeline";
import {
  resolveEffectivePreviewAppearance,
  type PreviewAppearanceChoice,
} from "@/lib/branding/preview-appearance";

import styles from "./editor-live-preview.module.css";

export function EditorLivePreview({
  stages,
  companionSections = [],
  clinicThemeMode,
  fontClassName,
  fontCssVariable,
}: {
  stages: Array<{
    key: string;
    title: string;
    body: string;
    periodLabel: string;
    startDay: string;
    endDay: string;
  }>;
  companionSections?: Array<{
    key: string;
    title: string;
    kindLabel: string;
  }>;
  clinicThemeMode?: string | null;
  fontClassName?: string;
  fontCssVariable?: `--font-clinic-${string}` | null;
}) {
  const [appearance, setAppearance] =
    useState<PreviewAppearanceChoice>("portal");
  const portalPreference = usePortalThemePreference();
  const patientTheme = resolveEffectivePreviewAppearance({
    choice: appearance,
    clinicThemeMode,
    portalPreference,
  });
  const sections = editorStagesToPreviewSections(stages);
  const hasTimeline = sections.length > 0;
  const appearanceControl = (
    <PatientPreviewAppearanceSelect
      value={appearance}
      clinicThemeMode={clinicThemeMode}
      portalPreference={portalPreference}
      onChange={setAppearance}
    />
  );

  return (
    <PatientThemeBoundary
      appearance={patientTheme}
      fontClassName={fontClassName}
      fontCssVariable={fontCssVariable}
    >
      <div
        className={
          hasTimeline || companionSections.length > 0
            ? styles.preview
            : `${styles.preview} ${styles.emptyState}`
        }
        data-live-preview=""
        data-recovery-timeline={hasTimeline ? "present" : "absent"}
      >
        <div className={styles.toolbar}>
          <h2 id="editor-live-preview-heading" className={styles.heading}>
            Patient preview
          </h2>
          {appearanceControl}
        </div>
        <p className="sr-only">
          Live preview of the current unsaved draft. This is not the public
          patient page.
        </p>
        {hasTimeline ? (
          <RecoveryTimelineList
            sections={sections}
            heading="Live patient timeline"
            headingId="editor-live-timeline-heading"
            compact
            classes={{
              timeline: "",
              sectionTitle: styles.title,
              timelineList: styles.list,
              timelineItem: styles.item,
              timelinePeriod: styles.period,
              timelineRail: styles.rail,
              timelineContent: styles.content,
            }}
          />
        ) : (
          <p className={styles.empty}>{RECOVERY_TIMELINE_ABSENT_NOTE}</p>
        )}
        {companionSections.length > 0 ? (
          <ul className={styles.companionList}>
            {companionSections.map((section) => (
              <li key={section.key} className={styles.companionItem}>
                <p className={styles.period}>{section.kindLabel}</p>
                <p className={styles.title}>
                  {section.title.trim() || "Untitled section"}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </PatientThemeBoundary>
  );
}
