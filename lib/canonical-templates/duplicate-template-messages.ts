const DUPLICATE_TITLE_SUFFIX = " copy";
const CANONICAL_TEMPLATE_TITLE_MAX = 120;

export function suggestDuplicateTemplateTitle(title: string): string {
  const trimmed = title.trim();
  const room = CANONICAL_TEMPLATE_TITLE_MAX - DUPLICATE_TITLE_SUFFIX.length;
  const base =
    trimmed.length > room ? trimmed.slice(0, room).trimEnd() : trimmed;
  return `${base}${DUPLICATE_TITLE_SUFFIX}`;
}

export const CANONICAL_DUPLICATE_UNPUBLISHED_MESSAGE =
  "Publish this template before duplicating it. Duplication copies the latest published revision.";

export const CANONICAL_DUPLICATE_CATEGORY_MESSAGE =
  "A duplicate stays in the source service category.";

export const CANONICAL_DUPLICATE_DESCRIPTION =
  "This creates a new draft from the latest published revision. An open draft on the source is not copied. The new template is not published, and clinic guides stay on the source template.";
