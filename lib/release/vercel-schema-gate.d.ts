export type VercelSchemaGateDecision =
  | { run: false; reason: "not-production" }
  | { run: false; reason: "skipped" }
  | { run: true; reason: "production" };

export type MigrateStatusState = "up-to-date" | "pending" | "unrecognized";

export function shouldRunVercelProductionSchemaGate(
  env: NodeJS.Dict<string | undefined>
): VercelSchemaGateDecision;

export function interpretMigrateStatusOutput(
  output: string
): MigrateStatusState;
