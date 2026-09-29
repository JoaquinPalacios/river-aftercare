import { GuideDocument } from "@/app/(aftercare)/components/guide-document";
import {
  AFTERCARE_THEME_SCOPE,
  DEFAULT_AFTERCARE_THEME,
  serializeAftercareThemeCss,
} from "@/lib/branding/aftercare-theme";
import type { ComposedGuideSection } from "@/lib/aftercare/types";

const NEUTRAL_PREVIEW_THEME = serializeAftercareThemeCss(
  DEFAULT_AFTERCARE_THEME,
  { colorSchemeSelector: "scope" }
);

export function CanonicalGuidePreview({
  sections,
}: {
  sections: ComposedGuideSection[];
}) {
  return (
    <div
      className="flex flex-col gap-4 rounded-xl border border-staff-line bg-staff-panel p-5"
      data-canonical-preview=""
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold tracking-tight">Preview</h2>
        <span className="staffStatusPill" data-tone="draft">
          Preview
        </span>
      </div>
      <p className="text-sm text-staff-muted">
        Neutral River preview of the guide content. This is not a clinic-branded
        patient page, and it does not include a practice name or contact
        details.
      </p>
      {sections.length === 0 ? (
        <p className="text-sm text-staff-muted">
          Add a section to see the guide preview.
        </p>
      ) : (
        <>
          <style dangerouslySetInnerHTML={{ __html: NEUTRAL_PREVIEW_THEME }} />
          <div className={AFTERCARE_THEME_SCOPE} data-patient-theme="portal">
            <GuideDocument sections={sections} />
          </div>
        </>
      )}
    </div>
  );
}
