export const IMPORT_SAMPLE_REFUSAL =
  "Sample templates cannot be imported. The demo bootstrap remains the only writer of the extraction sample.";

export function unsupportedImportSchemaVersionMessage(value: unknown): string {
  const shown = value === undefined ? "missing" : JSON.stringify(value);
  return `Unsupported canonical template import schema version ${shown}. This importer supports schema version 1 only and does not reinterpret other payloads.`;
}
