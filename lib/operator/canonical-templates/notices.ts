export const OPERATOR_TEMPLATE_NOTICES: Record<string, string> = {
  published:
    "Revision published. It is now immutable, and eligible clinics can discover this template. Clinics already pinned to an earlier revision are not updated.",
  "revision-opened":
    "New draft opened from the latest published revision. Review evidence was not copied.",
  "draft-exists": "This template already has an open draft.",
  "template-removed":
    "The unpublished template and its only draft were removed. Published revisions are never deleted here.",
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
