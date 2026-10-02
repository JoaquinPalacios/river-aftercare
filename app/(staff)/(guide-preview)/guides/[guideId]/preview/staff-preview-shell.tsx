"use client";

import { useState, type ReactNode } from "react";

import { PatientThemeBoundary } from "@/app/(aftercare)/components/patient-theme-boundary";
import { PatientPreviewAppearanceSelect } from "@/app/(staff)/components/patient-preview-appearance-select";
import { usePortalThemePreference } from "@/app/(staff)/components/use-portal-theme-preference";
import { StaffPreviewToolbar } from "@/app/(staff)/(guide-preview)/guides/[guideId]/preview/staff-preview-toolbar";
import {
  resolveEffectivePreviewAppearance,
  type PreviewAppearanceChoice,
} from "@/lib/branding/preview-appearance";
import type { ClinicGuideLifecycleStatus } from "@/lib/clinic-portal/guide-status-view";

export function StaffPreviewShell({
  backHref,
  backLabel,
  editHref,
  editLabel,
  statusLabel,
  statusDetail,
  lifecycle,
  clinicThemeMode,
  fontClassName,
  fontCssVariable,
  banner,
  printLabel,
  children,
}: {
  backHref: string;
  backLabel: string;
  editHref?: string;
  editLabel?: string;
  statusLabel?: string;
  statusDetail?: string;
  lifecycle?: ClinicGuideLifecycleStatus;
  clinicThemeMode?: string | null;
  fontClassName?: string;
  fontCssVariable?: `--font-clinic-${string}` | null;
  banner?: ReactNode;
  printLabel?: string;
  children: ReactNode;
}) {
  const [appearance, setAppearance] =
    useState<PreviewAppearanceChoice>("portal");
  const portalPreference = usePortalThemePreference();
  const previewTheme = resolveEffectivePreviewAppearance({
    choice: appearance,
    clinicThemeMode,
    portalPreference,
  });

  return (
    <div className="staffPreviewShell" data-preview-theme={previewTheme}>
      <StaffPreviewToolbar
        backHref={backHref}
        backLabel={backLabel}
        editHref={editHref}
        editLabel={editLabel}
        statusLabel={statusLabel}
        statusDetail={statusDetail}
        lifecycle={lifecycle}
        printLabel={printLabel}
        appearanceControl={
          <PatientPreviewAppearanceSelect
            value={appearance}
            clinicThemeMode={clinicThemeMode}
            portalPreference={portalPreference}
            onChange={setAppearance}
          />
        }
      />
      {banner}
      <PatientThemeBoundary
        appearance={previewTheme}
        fontClassName={fontClassName}
        fontCssVariable={fontCssVariable}
      >
        {children}
      </PatientThemeBoundary>
    </div>
  );
}
