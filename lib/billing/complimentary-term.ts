import "server-only";

import type { CommercialArrangement, EntitlementStatus } from "@prisma/client";

export const COMPLIMENTARY_REASON_MAX = 1000;
export const COMPLIMENTARY_CUSTOM_HORIZON_YEARS = 10;

export const COMPLIMENTARY_DURATIONS = [
  "SIX_MONTHS",
  "TWELVE_MONTHS",
  "CUSTOM",
  "INDEFINITE",
] as const;

export type ComplimentaryDuration = (typeof COMPLIMENTARY_DURATIONS)[number];
export type ComplimentaryPlan = "ESSENTIAL" | "PRACTICE";

const SYDNEY = "Australia/Sydney";

export function parseComplimentaryPlan(
  value: unknown
): ComplimentaryPlan | null {
  if (value === "ESSENTIAL" || value === "PRACTICE") {
    return value;
  }
  return null;
}

export function parseComplimentaryDuration(
  value: unknown
): ComplimentaryDuration | null {
  if (
    value === "SIX_MONTHS" ||
    value === "TWELVE_MONTHS" ||
    value === "CUSTOM" ||
    value === "INDEFINITE"
  ) {
    return value;
  }
  return null;
}

export function parseComplimentaryReason(
  value: unknown
): { ok: true; reason: string } | { ok: false; error: string } {
  if (typeof value !== "string") {
    return { ok: false, error: "A reason is required." };
  }
  const reason = value.trim().replace(/\s+/g, " ");
  if (reason.length === 0) {
    return { ok: false, error: "A reason is required." };
  }
  if (reason.length > COMPLIMENTARY_REASON_MAX) {
    return {
      ok: false,
      error: `The reason must be ${COMPLIMENTARY_REASON_MAX} characters or fewer.`,
    };
  }
  return { ok: true, reason };
}

export function addUtcMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)
  ).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

function isRealCalendarDate(year: number, month: number, day: number): boolean {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false;
  }
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

function parseIsoDate(
  value: unknown
): { year: number; month: number; day: number } | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (!isRealCalendarDate(year, month, day)) {
    return null;
  }
  return { year, month, day };
}

function sydneyOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SYDNEY,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second")
  );
  const truncated = instant.getTime() - instant.getMilliseconds();
  return asUtc - truncated;
}

function sydneyLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number
): Date {
  const desiredLocalAsUtc = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    millisecond
  );
  const guess = new Date(desiredLocalAsUtc);
  const offset = sydneyOffsetMs(guess);
  const resolved = new Date(desiredLocalAsUtc - offset);
  const offsetAtResolved = sydneyOffsetMs(resolved);
  if (offsetAtResolved === offset) {
    return resolved;
  }
  return new Date(desiredLocalAsUtc - offsetAtResolved);
}

export function endOfSydneyDay(year: number, month: number, day: number): Date {
  return sydneyLocalToUtc(year, month, day, 23, 59, 59, 999);
}

export function sydneyNoon(year: number, month: number, day: number): Date {
  return sydneyLocalToUtc(year, month, day, 12, 0, 0, 0);
}

function withinHorizon(date: Date, now: Date): boolean {
  const horizon = addUtcMonths(now, COMPLIMENTARY_CUSTOM_HORIZON_YEARS * 12);
  return date.getTime() <= horizon.getTime();
}

export function parseOptionalReviewDate(
  value: unknown,
  now: Date
): { ok: true; reviewAt: Date | null } | { ok: false; error: string } {
  if (value == null) {
    return { ok: true, reviewAt: null };
  }
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: true, reviewAt: null };
  }
  const parsed = parseIsoDate(value.trim());
  if (!parsed) {
    return { ok: false, error: "Enter a valid review date." };
  }
  const reviewAt = sydneyNoon(parsed.year, parsed.month, parsed.day);
  const earliest = addUtcMonths(now, -COMPLIMENTARY_CUSTOM_HORIZON_YEARS * 12);
  if (
    reviewAt.getTime() < earliest.getTime() ||
    !withinHorizon(reviewAt, now)
  ) {
    return {
      ok: false,
      error: `Choose a review date within ${COMPLIMENTARY_CUSTOM_HORIZON_YEARS} years.`,
    };
  }
  return { ok: true, reviewAt };
}

export function parseCustomEndDate(
  value: unknown,
  now: Date
): { ok: true; expiresAt: Date } | { ok: false; error: string } {
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, error: "Choose the complimentary end date." };
  }
  const parsed = parseIsoDate(value.trim());
  if (!parsed) {
    return { ok: false, error: "Enter a valid end date." };
  }
  const expiresAt = endOfSydneyDay(parsed.year, parsed.month, parsed.day);
  if (expiresAt.getTime() <= now.getTime()) {
    return { ok: false, error: "Choose an end date after today." };
  }
  if (!withinHorizon(expiresAt, now)) {
    return {
      ok: false,
      error: `Choose an end date within ${COMPLIMENTARY_CUSTOM_HORIZON_YEARS} years, or choose indefinite access.`,
    };
  }
  return { ok: true, expiresAt };
}

export type ComplimentaryTerm = {
  expiresAt: Date | null;
  indefinite: boolean;
};

/**
 * The next complimentary expiry.
 *
 * Six and 12 months are added to the later of now and a current future expiry.
 * A custom date is an absolute Sydney end date and must be later than that
 * same instant. Indefinite access has no expiry. A dated extension cannot
 * replace an indefinite agreement.
 */
export function nextComplimentaryExpiry(input: {
  duration: ComplimentaryDuration;
  now: Date;
  currentExpiresAt: Date | null;
  currentIndefinite: boolean;
  customExpiresAt?: Date | null;
}): { ok: true; term: ComplimentaryTerm } | { ok: false; error: string } {
  if (input.duration === "INDEFINITE") {
    return { ok: true, term: { expiresAt: null, indefinite: true } };
  }
  if (input.currentIndefinite) {
    return {
      ok: false,
      error:
        "Indefinite complimentary access stays open. Choose indefinite again to record another note, or contact River Aftercare before adding an end date.",
    };
  }
  const baseline =
    input.currentExpiresAt &&
    input.currentExpiresAt.getTime() > input.now.getTime()
      ? input.currentExpiresAt
      : input.now;
  if (input.duration === "SIX_MONTHS" || input.duration === "TWELVE_MONTHS") {
    const months = input.duration === "SIX_MONTHS" ? 6 : 12;
    return {
      ok: true,
      term: {
        expiresAt: addUtcMonths(baseline, months),
        indefinite: false,
      },
    };
  }
  const custom = input.customExpiresAt;
  if (!custom) {
    return { ok: false, error: "Choose the complimentary end date." };
  }
  if (custom.getTime() <= baseline.getTime()) {
    return {
      ok: false,
      error: "Choose an end date after the current complimentary expiry.",
    };
  }
  return { ok: true, term: { expiresAt: custom, indefinite: false } };
}

export function complimentaryAccessExpired(input: {
  commercialArrangement: CommercialArrangement | null | undefined;
  entitlementStatus: EntitlementStatus | null | undefined;
  complimentaryExpiresAt: Date | null | undefined;
  now: Date;
}): boolean {
  return (
    input.commercialArrangement === "COMPLIMENTARY" &&
    input.entitlementStatus === "ACTIVE" &&
    input.complimentaryExpiresAt instanceof Date &&
    input.complimentaryExpiresAt.getTime() <= input.now.getTime()
  );
}

export function isComplimentaryArrangement(
  arrangement: CommercialArrangement | null | undefined
): boolean {
  return arrangement === "COMPLIMENTARY";
}

/** Product authorization after complimentary expiry. Paid rows are unchanged. */
export function complimentaryProductStatus(input: {
  entitlementStatus: EntitlementStatus | null;
  commercialArrangement: CommercialArrangement | null | undefined;
  complimentaryExpiresAt: Date | null | undefined;
  now: Date;
}): EntitlementStatus | null {
  if (
    complimentaryAccessExpired({
      commercialArrangement: input.commercialArrangement,
      entitlementStatus: input.entitlementStatus,
      complimentaryExpiresAt: input.complimentaryExpiresAt,
      now: input.now,
    })
  ) {
    return "ENDED";
  }
  return input.entitlementStatus;
}
