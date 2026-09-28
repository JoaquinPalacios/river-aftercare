export const IMPORT_REVIEW_WILL_CLEAR =
  "This update changes patient-visible content and will invalidate the recorded review.";

export const IMPORT_REVIEW_WILL_KEEP =
  "Imported content matches the open draft. Recorded review evidence will be kept.";

export const IMPORT_REVIEW_CLEARED =
  "Review invalidated; the draft must be reviewed again before publication.";

export const IMPORT_REVIEW_KEPT = "Recorded review was not invalidated.";

export const IMPORT_SAMPLE_REFUSAL =
  "Sample templates cannot be imported. The demo bootstrap remains the only writer of the extraction sample.";

export function unsupportedImportSchemaVersionMessage(value: unknown): string {
  const shown = value === undefined ? "missing" : JSON.stringify(value);
  return `Unsupported canonical template import schema version ${shown}. This importer supports schema version 1 only and does not reinterpret other payloads.`;
}
