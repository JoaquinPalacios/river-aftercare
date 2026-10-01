export const OPERATOR_TEMPLATE_NOTICES: Record<string, string> = {
  published:
    "Template published. The revision is now read-only. Eligible clinics can discover this template. Clinics already pinned to an earlier revision are not updated.",
  "revision-opened":
    "New draft opened from the latest published revision. The published revision stays unchanged.",
  "draft-exists": "This template already has an open draft.",
  "template-removed":
    "The template and its unpublished draft were permanently removed.",
  "draft-abandoned":
    "The draft was removed. Published revisions are unchanged.",
  deactivated:
    "Template deactivated. It no longer appears for new clinic adoption. Existing clinic guides and patient pages are unchanged.",
  reactivated:
    "Template reactivated. Eligible clinics can discover the latest published revision again.",
};

export function operatorTemplateNotice(
  code: string | undefined
): string | null {
  if (!code) {
    return null;
  }
  return OPERATOR_TEMPLATE_NOTICES[code] ?? null;
}
