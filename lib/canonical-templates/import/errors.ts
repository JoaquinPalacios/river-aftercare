export class CanonicalTemplateImportError extends Error {
  readonly code:
    | "unsupported_schema"
    | "invalid"
    | "forbidden_field"
    | "conflict"
    | "actor"
    | "sample"
    | "usage"
    | "failed";

  constructor(
    message: string,
    code:
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
    this.code = code;
  }
}

export function isCanonicalTemplateImportError(
  error: unknown
): error is CanonicalTemplateImportError {
  return error instanceof CanonicalTemplateImportError;
}
