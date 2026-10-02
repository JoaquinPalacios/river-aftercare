export const IMPORT_SAMPLE_REFUSAL =
  "Sample templates cannot be imported. Edit them in Operator Templates. Import does not overwrite a sample.";

export function unsupportedImportSchemaVersionMessage(value: unknown): string {
  const shown = value === undefined ? "missing" : JSON.stringify(value);
  return `Unsupported canonical template import schema version ${shown}. This importer supports schema version 1 only and does not reinterpret other payloads.`;
}
