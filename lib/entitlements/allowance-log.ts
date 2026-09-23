import "server-only";

export type AllowanceExtraDimension =
  "team_members" | "custom_guides" | "template_adaptations";

export type OperatorAllowanceExtraLogEvent = {
  event: "operator_allowance_extra_updated";
  actorUserId: string;
  clinicId: string;
  dimension: AllowanceExtraDimension;
  previousExtra: number;
  nextExtra: number;
  effectiveAllowance: number;
};

export function logOperatorAllowanceExtra(
  entry: OperatorAllowanceExtraLogEvent
): void {
  console.info(entry);
}
