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

export class BulkCanonicalTemplateError extends Error {
  readonly failures: readonly { title: string; message: string }[];

  constructor(
    message: string,
    failures: readonly { title: string; message: string }[]
  ) {
    super(message);
    this.name = "BulkCanonicalTemplateError";
    this.failures = failures;
  }
}

export function isBulkCanonicalTemplateError(
  error: unknown
): error is BulkCanonicalTemplateError {
  return error instanceof BulkCanonicalTemplateError;
}
