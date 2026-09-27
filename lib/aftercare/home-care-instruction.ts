export const HOME_CARE_FREQUENCY_PERIODS = ["DAY", "WEEK"] as const;

export type HomeCareFrequencyPeriod =
  (typeof HOME_CARE_FREQUENCY_PERIODS)[number];

export const HOME_CARE_DURATION_UNITS = ["DAYS", "WEEKS"] as const;

export type HomeCareDurationUnit = (typeof HOME_CARE_DURATION_UNITS)[number];

/** Published guidance item. Not a completion, reminder, or adherence record. */
export interface HomeCareInstruction {
  key: string;
  title: string;
  body: string | null;
  frequencyCount: number | null;
  frequencyPeriod: HomeCareFrequencyPeriod | null;
  timingLabel: string | null;
  durationValue: number | null;
  durationUnit: HomeCareDurationUnit | null;
  sortOrder: number;
}

export interface HomeCareInstructionSummaryInput {
  frequencyCount: number | null;
  frequencyPeriod: HomeCareFrequencyPeriod | null;
  timingLabel: string | null;
  durationValue: number | null;
  durationUnit: HomeCareDurationUnit | null;
}

function formatFrequency(
  count: number,
  period: HomeCareFrequencyPeriod
): string {
  if (count === 1 && period === "DAY") {
    return "Once daily";
  }
  if (count === 1 && period === "WEEK") {
    return "Once per week";
  }
  const unit = period === "DAY" ? "day" : "week";
  return `${count} times per ${unit}`;
}

function formatDuration(value: number, unit: HomeCareDurationUnit): string {
  if (unit === "DAYS") {
    return value === 1 ? "1 day" : `${value} days`;
  }
  return value === 1 ? "1 week" : `${value} weeks`;
}

/**
 * Patient-facing scan line. Duration-only instructions use "For".
 * Omitted fields are left out. An item with no schedule returns null.
 */
export function formatHomeCareInstructionSummary(
  item: HomeCareInstructionSummaryInput
): string | null {
  const parts: string[] = [];
  if (
    item.frequencyCount !== null &&
    item.frequencyCount > 0 &&
    item.frequencyPeriod
  ) {
    parts.push(formatFrequency(item.frequencyCount, item.frequencyPeriod));
  }
  const timing = item.timingLabel?.trim() ?? "";
  if (timing) {
    parts.push(timing);
  }
  if (
    item.durationValue !== null &&
    item.durationValue > 0 &&
    item.durationUnit
  ) {
    const duration = formatDuration(item.durationValue, item.durationUnit);
    if (parts.length === 0) {
      return `For ${duration}`;
    }
    parts.push(duration);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function homeCareInstructionSignature(
  instructions:
    | readonly (Omit<HomeCareInstruction, "sortOrder"> & {
        sortOrder?: number;
      })[]
    | null
    | undefined
): string {
  return JSON.stringify(
    (instructions ?? []).map((item, index) => ({
      key: item.key,
      title: item.title.trim(),
      body: item.body?.trim() ? item.body.trim() : null,
      frequencyCount: item.frequencyCount,
      frequencyPeriod: item.frequencyPeriod,
      timingLabel: item.timingLabel?.trim() ? item.timingLabel.trim() : null,
      durationValue: item.durationValue,
      durationUnit: item.durationUnit,
      sortOrder: index + 1,
    }))
  );
}
