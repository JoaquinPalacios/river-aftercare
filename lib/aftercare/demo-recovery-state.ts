import type { ComposedGuideSection } from "@/lib/aftercare/types";
import { normalizeDayRange } from "@/lib/aftercare/timeline-range";

export interface DemoRecoveryFixture {
  simulatedDay: number;
  recoveryWindowDays: number;
  /** Explicit ISO `YYYY-MM-DD` for Day 0. Never inferred from the system clock. */
  simulatedStartDate?: string;
}

export type TimelineStageStatus = "earlier" | "current" | "upcoming";

export interface ResolvedTimelineStage {
  key: string;
  title: string;
  body: string;
  periodLabel: string | null;
  startDay: number;
  endDay: number;
  status: TimelineStageStatus;
}

export interface ResolvedRecoveryState {
  simulatedDay: number;
  windowDays: number;
  simulatedStartDate: string | null;
  progress: number | null;
  hasTimeline: boolean;
  currentStage: ResolvedTimelineStage | null;
  nextStage: ResolvedTimelineStage | null;
  stages: ResolvedTimelineStage[];
}

export interface DemoTodayAlert {
  key: string;
  tone: "warning" | "emergency";
  title: string;
  body: string;
}

export interface DemoTodayContent {
  whatToDo: { title: string; body: string } | null;
  whatIsNormal: { title: string; body: string } | null;
  alerts: DemoTodayAlert[];
  comingNext: { periodLabel: string | null; title: string } | null;
}

const RANGE_PATTERN = /days?\s+(\d+)\s*[–—−-]\s*(\d+)/i;
const DAY_PATTERN = /\bday\s+(\d+)\b/i;
const WEEK_PLUS_PATTERN = /week\s+(\d+)\s*\+/i;
const WEEK_PATTERN = /week\s+(\d+)/i;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function fallbackRange(
  index: number,
  count: number,
  windowDays: number
): { startDay: number; endDay: number } {
  if (count <= 0) {
    return { startDay: 1, endDay: windowDays };
  }

  const startDay = Math.floor((index * windowDays) / count) + 1;
  const endDay = Math.max(
    startDay,
    Math.floor(((index + 1) * windowDays) / count)
  );
  return { startDay, endDay };
}

export function parsePeriodDayRange(
  periodLabel: string | null,
  index: number,
  stageCount: number,
  windowDays: number
): { startDay: number; endDay: number } {
  const label = periodLabel?.trim() ?? "";

  if (label.length === 0) {
    return fallbackRange(index, stageCount, windowDays);
  }

  if (/today|first\s+24/i.test(label)) {
    return { startDay: 1, endDay: 1 };
  }

  const range = label.match(RANGE_PATTERN);
  if (range) {
    const startDay = Number(range[1]);
    const endDay = Number(range[2]);
    return {
      startDay: Math.min(startDay, endDay),
      endDay: Math.max(startDay, endDay),
    };
  }

  const day = label.match(DAY_PATTERN);
  if (day) {
    const value = Number(day[1]);
    return { startDay: value, endDay: value };
  }

  const weekPlus = label.match(WEEK_PLUS_PATTERN);
  if (weekPlus) {
    const week = Number(weekPlus[1]);
    const startDay = (week - 1) * 7 + 1;
    return { startDay, endDay: Math.max(windowDays, startDay) };
  }

  const week = label.match(WEEK_PATTERN);
  if (week) {
    const value = Number(week[1]);
    return { startDay: (value - 1) * 7 + 1, endDay: value * 7 };
  }

  if (/hour/i.test(label)) {
    return { startDay: 0, endDay: 0 };
  }

  return fallbackRange(index, stageCount, windowDays);
}

function stageStatus(
  startDay: number,
  endDay: number,
  simulatedDay: number
): TimelineStageStatus {
  if (endDay < simulatedDay) {
    return "earlier";
  }

  if (startDay > simulatedDay) {
    return "upcoming";
  }

  return "current";
}

export function resolveDemoRecoveryState(
  sections: ComposedGuideSection[],
  fixture: DemoRecoveryFixture
): ResolvedRecoveryState {
  const timelineSections = sections.filter(
    (section) => section.kind === "RECOVERY_TIMELINE"
  );
  const simulatedDay = Math.max(0, fixture.simulatedDay);
  const simulatedStartDate = fixture.simulatedStartDate ?? null;
  const parsedRanges = timelineSections.map((section, index) => {
    const structured = normalizeDayRange(section.startDay, section.endDay);
    if (structured.startDay !== null && structured.endDay !== null) {
      return {
        startDay: structured.startDay,
        endDay: structured.endDay,
      };
    }

    return parsePeriodDayRange(
      section.periodLabel,
      index,
      timelineSections.length,
      fixture.recoveryWindowDays
    );
  });
  const inferredWindow = parsedRanges.reduce(
    (max, range) => Math.max(max, range.endDay),
    0
  );
  const windowDays = Math.max(1, fixture.recoveryWindowDays, inferredWindow);

  if (timelineSections.length === 0) {
    return {
      simulatedDay,
      windowDays,
      simulatedStartDate,
      progress: null,
      hasTimeline: false,
      currentStage: null,
      nextStage: null,
      stages: [],
    };
  }

  const stages: ResolvedTimelineStage[] = timelineSections.map(
    (section, index) => {
      const range = parsedRanges[index] ?? {
        startDay: 1,
        endDay: windowDays,
      };

      return {
        key: section.key,
        title: section.title,
        body: section.body,
        periodLabel: section.periodLabel,
        startDay: range.startDay,
        endDay: range.endDay,
        status: stageStatus(range.startDay, range.endDay, simulatedDay),
      };
    }
  );

  const currentStage =
    stages.find((stage) => stage.status === "current") ?? null;
  const currentIndex = currentStage
    ? stages.findIndex((stage) => stage.key === currentStage.key)
    : -1;
  const nextStage =
    currentIndex >= 0
      ? (stages
          .slice(currentIndex + 1)
          .find((stage) => stage.status === "upcoming") ?? null)
      : (stages.find((stage) => stage.status === "upcoming") ?? null);

  return {
    simulatedDay,
    windowDays,
    simulatedStartDate,
    progress: clamp(simulatedDay / windowDays, 0, 1),
    hasTimeline: true,
    currentStage,
    nextStage,
    stages,
  };
}

export function timelineStatusByKey(
  state: ResolvedRecoveryState
): Record<string, TimelineStageStatus> {
  return Object.fromEntries(
    state.stages.map((stage) => [stage.key, stage.status])
  );
}

export function firstSectionOfKind(
  sections: ComposedGuideSection[],
  kind: ComposedGuideSection["kind"]
): ComposedGuideSection | null {
  return sections.find((section) => section.kind === kind) ?? null;
}

export function buildDemoTodayContent(
  sections: ComposedGuideSection[],
  recovery: ResolvedRecoveryState
): DemoTodayContent {
  const whatIsNormal = firstSectionOfKind(sections, "WHAT_IS_NORMAL");
  const alerts: DemoTodayAlert[] = [];
  for (const section of sections) {
    if (section.kind === "WARNING_SIGNS") {
      alerts.push({
        key: section.key,
        tone: "warning",
        title: section.title,
        body: section.body,
      });
    } else if (section.kind === "EMERGENCY") {
      alerts.push({
        key: section.key,
        tone: "emergency",
        title: section.title,
        body: section.body,
      });
    }
  }

  return {
    whatToDo: recovery.currentStage
      ? { title: recovery.currentStage.title, body: recovery.currentStage.body }
      : null,
    whatIsNormal: whatIsNormal
      ? { title: whatIsNormal.title, body: whatIsNormal.body }
      : null,
    alerts,
    comingNext: recovery.nextStage
      ? {
          periodLabel: recovery.nextStage.periodLabel,
          title: recovery.nextStage.title,
        }
      : null,
  };
}
