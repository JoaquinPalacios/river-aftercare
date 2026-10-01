import Link from "next/link";

import { CopyPreviewLinkButton } from "@/app/(staff)/(operator)/operator/templates/copy-preview-link-button";
import {
  CANONICAL_PREVIEW_BRAND_NOTE,
  CANONICAL_PREVIEW_OPERATOR_LABEL,
  canonicalTemplatePublishedPreviewPath,
  canonicalTemplateRevisionPreviewPath,
} from "@/lib/canonical-templates/preview-brand";

export function TemplatePreviewCard({
  templateId,
  published,
  draftId,
}: {
  templateId: string;
  published: boolean;
  draftId: string | null;
}) {
  const publishedPath = published
    ? canonicalTemplatePublishedPreviewPath(templateId)
    : null;
  const draftPath = draftId
    ? canonicalTemplateRevisionPreviewPath(templateId, draftId)
    : null;
  const primaryPath = publishedPath ?? draftPath;

  return (
    <section
      className="templateOverviewCard"
      aria-labelledby="patient-preview-heading"
    >
      <h2 id="patient-preview-heading">Patient preview</h2>
      <p className="mt-2 text-sm font-medium">
        {CANONICAL_PREVIEW_OPERATOR_LABEL}
      </p>
      <p className="mt-2 text-sm text-staff-muted">
        {CANONICAL_PREVIEW_BRAND_NOTE}
      </p>
      {primaryPath ? (
        <p className="mt-2 text-sm text-staff-muted">
          {publishedPath
            ? "Open preview shows the latest published revision. This address requires an operator sign-in. It is not a public patient page."
            : "This template is not published yet. Open preview shows the saved draft. This address requires an operator sign-in. It is not a public patient page."}
        </p>
      ) : (
        <p className="mt-2 text-sm text-staff-muted">
          Publish a revision to preview the patient guide.
        </p>
      )}
      {primaryPath ? (
        <div className="templateOverviewActions mt-4">
          <Link href={primaryPath} className="staffBtn staffBtnPrimary">
            Open preview
          </Link>
          <CopyPreviewLinkButton path={primaryPath} />
          {publishedPath && draftPath ? (
            <Link href={draftPath} className="staffBtn staffBtnSecondary">
              Preview draft
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
