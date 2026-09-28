export class CanonicalTemplateImportError extends Error {
  constructor(
    message: string,
    readonly code:
      | "unsupported_schema"
      | "invalid"
      | "forbidden_field"
      | "conflict"
      | "actor"
      | "sample"
      | "usage"
      | "failed"
  ) {
    super(message);
    this.name = "CanonicalTemplateImportError";
  }
}

export function isCanonicalTemplateImportError(
  error: unknown
): error is CanonicalTemplateImportError {
  return error instanceof CanonicalTemplateImportError;
}
