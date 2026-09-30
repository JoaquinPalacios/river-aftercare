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

function optionalPositiveInt(
  value: number | string | null | undefined
): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export interface EditableHomeCareScheduleInput {
  frequencyCount: number | string | null;
  frequencyPeriod: HomeCareFrequencyPeriod | "" | null;
  timingLabel: string | null;
  durationValue: number | string | null;
  durationUnit: HomeCareDurationUnit | "" | null;
}

/**
 * Editor schedule line. Wording comes from the patient summary formatter.
 * Incomplete pairs and blank fields are omitted, so "Not specified" never
 * appears. An instruction with no usable schedule returns null.
 */
export function formatEditableHomeCareSchedule(
  input: EditableHomeCareScheduleInput
): string | null {
  return formatHomeCareInstructionSummary({
    frequencyCount: optionalPositiveInt(input.frequencyCount),
    frequencyPeriod: input.frequencyPeriod || null,
    timingLabel: input.timingLabel,
    durationValue: optionalPositiveInt(input.durationValue),
    durationUnit: input.durationUnit || null,
  });
}

/** True when any schedule field has text, including an incomplete pair. */
export function editableHomeCareScheduleHasValue(
  input: EditableHomeCareScheduleInput
): boolean {
  return [
    input.frequencyCount,
    input.frequencyPeriod,
    input.timingLabel,
    input.durationValue,
    input.durationUnit,
  ].some((value) => String(value ?? "").trim() !== "");
}

/**
 * Collapsed instruction label. Schedule wording matches the patient summary.
 * The instruction number is omitted when it would repeat the title, and when
 * a schedule already identifies the row.
 */
export function homeCareInstructionAccordionLabel(input: {
  index: number;
  title: string;
  frequencyCount: number | string | null;
  frequencyPeriod: HomeCareFrequencyPeriod | "" | null;
  timingLabel: string | null;
  durationValue: number | string | null;
  durationUnit: HomeCareDurationUnit | "" | null;
}): string {
  const numberLabel = `Instruction ${input.index + 1}`;
  const title = input.title.trim();
  const schedule = formatEditableHomeCareSchedule(input);
  const titleRepeatsNumber = title.toLowerCase() === numberLabel.toLowerCase();
  if (!title || titleRepeatsNumber) {
    return schedule ? `${numberLabel} · ${schedule}` : numberLabel;
  }
  if (schedule) {
    return `${title} · ${schedule}`;
  }
  return `${numberLabel} · ${title}`;
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
