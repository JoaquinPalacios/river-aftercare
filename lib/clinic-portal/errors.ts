export class ClinicPortalError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_found"
      | "forbidden"
      | "conflict"
      | "invalid"
      | "slug_published"
      | "custom_guide_limit"
      | "adapted_template_limit"
      | "template_adaptation_unavailable"
      | "template_adaptation_required"
  ) {
    super(message);
    this.name = "ClinicPortalError";
  }
}

export function isClinicPortalError(
  error: unknown
): error is ClinicPortalError {
  return error instanceof ClinicPortalError;
}
