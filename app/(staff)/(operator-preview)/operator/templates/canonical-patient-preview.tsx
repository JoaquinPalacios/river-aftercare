import { GuideDocument } from "@/app/(aftercare)/components/guide-document";
import { PatientPage } from "@/app/(aftercare)/components/patient-page";
import { StaffPreviewShell } from "@/app/(staff)/(guide-preview)/guides/[guideId]/preview/staff-preview-shell";
import { editorSectionsToComposedGuide } from "@/lib/aftercare/editor-sections-to-document";
import {
  resolveAftercareTheme,
  serializeAftercareThemeCss,
} from "@/lib/branding/aftercare-theme";
import {
  CANONICAL_PREVIEW_BRAND_NOTE,
  CANONICAL_PREVIEW_OPERATOR_LABEL,
  CANONICAL_PREVIEW_THEME_INPUT,
  canonicalPreviewPracticeChrome,
} from "@/lib/canonical-templates/preview-brand";
import type { OperatorTemplateRevisionView } from "@/lib/operator/canonical-templates/load-operator-canonical-template";

import styles from "@/app/(aftercare)/patient.module.css";

export function CanonicalPatientPreview({
  templateId,
  templateTitle,
  isSample,
  revision,
}: {
  templateId: string;
  templateTitle: string;
  isSample: boolean;
  revision: OperatorTemplateRevisionView;
}) {
  const chrome = canonicalPreviewPracticeChrome();
  const theme = resolveAftercareTheme(CANONICAL_PREVIEW_THEME_INPUT);
  const sections = editorSectionsToComposedGuide(revision.sections);
  const status = revision.status === "PUBLISHED" ? "Published" : "Draft";

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: serializeAftercareThemeCss(theme, {
            themeMode: CANONICAL_PREVIEW_THEME_INPUT.themeMode,
            colorSchemeSelector: "scope",
          }),
        }}
      />
      <StaffPreviewShell
        backHref={`/operator/templates/${templateId}`}
        backLabel={`Back to ${templateTitle}`}
        editHref={
          isSample ? undefined : `/operator/templates/${templateId}/draft`
        }
        editLabel="View content"
        statusLabel={CANONICAL_PREVIEW_OPERATOR_LABEL}
        statusDetail={`Revision ${revision.version} · ${status}`}
        clinicThemeMode={CANONICAL_PREVIEW_THEME_INPUT.themeMode}
        banner={
          <p className="templatePreviewBrandNote">
            {CANONICAL_PREVIEW_BRAND_NOTE}
          </p>
        }
      >
        <PatientPage chrome={chrome} showAftercareDisclaimer>
          <header className={styles.hero}>
            <p className={styles.kicker}>{chrome.instructionsLabel}</p>
            <h1 className={styles.title}>{templateTitle}</h1>
            <p className={styles.lede}>
              Recovery information from {chrome.displayName}. Read the sections
              below in order, and contact the practice if you are unsure or need
              help.
            </p>
          </header>
          <GuideDocument sections={sections} />
        </PatientPage>
      </StaffPreviewShell>
    </>
  );
}
