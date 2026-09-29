export class CanonicalTemplateError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_found"
      | "conflict"
      | "invalid"
      | "sample"
      | "immutable"
      | "inactive"
      | "pinned"
  ) {
    super(message);
    this.name = "CanonicalTemplateError";
  }
}

export function isCanonicalTemplateError(
  error: unknown
): error is CanonicalTemplateError {
  return error instanceof CanonicalTemplateError;
}
