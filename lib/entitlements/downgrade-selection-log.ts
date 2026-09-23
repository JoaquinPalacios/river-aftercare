import "server-only";

export type DowngradeGuideSelectionLogEvent = {
  event: "downgrade_guide_selection_confirmed";
  clinicId: string;
  actorUserId: string;
  customCount: number;
  adaptedCount: number;
  combinedCount: number;
};

export type DowngradeRetentionAnomalyEvent = {
  event:
    | "downgrade_retention_selection_invalid"
    | "downgrade_retention_missing_selection";
  clinicId: string;
  customCount: number;
  adaptedCount: number;
  combinedCount: number;
  customLimit: number;
  adaptedLimit: number;
  combinedLimit: number;
};

export function logDowngradeGuideSelection(
  entry: DowngradeGuideSelectionLogEvent
): void {
  console.info(entry);
}

export function logDowngradeRetentionAnomaly(
  entry: DowngradeRetentionAnomalyEvent
): void {
  console.error(entry);
}
