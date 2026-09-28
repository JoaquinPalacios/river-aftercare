export const CANONICAL_TEMPLATE_IMPORT_SCHEMA_VERSION = 1;

export const CANONICAL_TEMPLATE_IMPORT_MODES = [
  "create",
  "create-revision",
  "update-draft",
] as const;

export type CanonicalTemplateImportMode =
  (typeof CANONICAL_TEMPLATE_IMPORT_MODES)[number];

export const CANONICAL_IMPORT_FORBIDDEN_LIFECYCLE_FIELDS = [
  "isSample",
  "isActive",
  "status",
  "reviewerName",
  "reviewerCredential",
  "reviewNote",
  "reviewedAt",
  "reviewRecordedByUserId",
  "publishedAt",
  "publishedByUserId",
  "createdByUserId",
  "deactivatedAt",
  "deactivatedByUserId",
  "reviewed",
  "approved",
  "publish",
  "published",
  "reviewedBy",
  "reviewedByUserId",
] as const;

export const CANONICAL_IMPORT_FORBIDDEN_IDENTITY_FIELDS = [
  "id",
  "templateId",
  "revisionId",
  "guideTemplateId",
  "version",
] as const;

const LIFECYCLE_FIELDS = new Set<string>(
  CANONICAL_IMPORT_FORBIDDEN_LIFECYCLE_FIELDS
);
const IDENTITY_FIELDS = new Set<string>(
  CANONICAL_IMPORT_FORBIDDEN_IDENTITY_FIELDS
);

export function forbiddenImportFieldMessage(key: string): string | null {
  if (key === "sortOrder") {
    return 'Import uses array order and does not accept "sortOrder".';
  }
  if (key === "upsert") {
    return 'Import mode "upsert" is not supported. Choose create, create-revision, or update-draft.';
  }
  if (LIFECYCLE_FIELDS.has(key)) {
    return `Import payloads cannot include "${key}". Import creates ordinary drafts and never records review or publication.`;
  }
  if (IDENTITY_FIELDS.has(key)) {
    return `Import payloads cannot include "${key}". The lifecycle assigns ids and revision versions.`;
  }
  return null;
}

export function isCanonicalTemplateImportMode(
  value: string
): value is CanonicalTemplateImportMode {
  return (CANONICAL_TEMPLATE_IMPORT_MODES as readonly string[]).includes(value);
}
