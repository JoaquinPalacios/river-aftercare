export class ClinicPortalError extends Error {
  readonly code:
    | "not_found"
    | "forbidden"
    | "conflict"
    | "invalid"
    | "slug_published"
    | "custom_guide_limit"
    | "adapted_template_limit"
    | "combined_guide_limit"
    | "template_adaptation_unavailable"
    | "template_adaptation_required"
    | "retained_read_only"
    | "capacity"
    | "retired_slug";

  constructor(
    message: string,
    code:
      | "not_found"
      | "forbidden"
      | "conflict"
      | "invalid"
      | "slug_published"
      | "custom_guide_limit"
      | "adapted_template_limit"
      | "combined_guide_limit"
      | "template_adaptation_unavailable"
      | "template_adaptation_required"
      | "retained_read_only"
      | "capacity"
      | "retired_slug"
  ) {
    super(message);
    this.name = "ClinicPortalError";
    this.code = code;
  }
}

export function isClinicPortalError(
  error: unknown
): error is ClinicPortalError {
  return error instanceof ClinicPortalError;
}
