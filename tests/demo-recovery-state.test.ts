import { describe, expect, it } from "vitest";

import {
  buildDemoTodayContent,
  parsePeriodDayRange,
  resolveDemoRecoveryState,
} from "@/lib/aftercare/demo-recovery-state";
import { DEMO_RECOVERY_FIXTURE } from "@/lib/aftercare/demo-tenant";
import type { ComposedGuideSection } from "@/lib/aftercare/types";

function section(
  overrides: Partial<ComposedGuideSection> &
    Pick<ComposedGuideSection, "key" | "kind" | "title">
): ComposedGuideSection {
  return {
    body: `${overrides.key} body`,
    periodLabel: null,
    provenance: "canonical",
    ...overrides,
  };
}

const EXTRACTION_STAGES: ComposedGuideSection[] = [
  section({
    key: "introduction",
    kind: "INTRODUCTION",
    title: "After your extraction",
    body: "Intro copy.",
  }),
  section({
    key: "immediate-care",
    kind: "RECOVERY_TIMELINE",
    title: "Immediate care",
    periodLabel: "First few hours",
    body: "Keep the site still.",
  }),
  section({
    key: "first-24-hours",
    kind: "RECOVERY_TIMELINE",
    title: "Protect the healing site",
    periodLabel: "Today / first 24 hours",
    body: "Leave the site undisturbed today.",
  }),
  section({
    key: "days-2-3",
    kind: "RECOVERY_TIMELINE",
    title: "Early recovery",
    periodLabel: "Days 2–3",
    body: "Swelling often peaks.",
  }),
  section({
    key: "days-4-7",
    kind: "RECOVERY_TIMELINE",
    title: "Healing check",
    periodLabel: "Days 4–7",
    body: "Discomfort should settle.",
  }),
  section({
    key: "what-is-normal",
    kind: "WHAT_IS_NORMAL",
    title: "What's normal",
    body: "Mild swelling can be expected.",
  }),
  section({
    key: "warning-signs",
    kind: "WARNING_SIGNS",
    title: "When to contact us",
    body: "Call if bleeding will not slow.",
  }),
];

describe("demo recovery-state resolver", () => {
  it("maps simulated day 1 onto the current and next timeline stages", () => {
    const recovery = resolveDemoRecoveryState(
      EXTRACTION_STAGES,
      DEMO_RECOVERY_FIXTURE
    );

    expect(recovery.hasTimeline).toBe(true);
    expect(recovery.simulatedDay).toBe(1);
    expect(recovery.windowDays).toBe(7);
    expect(recovery.progress).toBeCloseTo(1 / 7);
    expect(recovery.currentStage?.key).toBe("first-24-hours");
    expect(recovery.currentStage?.status).toBe("current");
    expect(recovery.nextStage?.key).toBe("days-2-3");
    expect(recovery.stages.map((stage) => stage.status)).toEqual([
      "earlier",
      "current",
      "upcoming",
      "upcoming",
    ]);
  });

  it("resolves later days and keeps progress deterministic", () => {
    const dayFive = resolveDemoRecoveryState(EXTRACTION_STAGES, {
      simulatedDay: 5,
      recoveryWindowDays: 7,
    });

    expect(dayFive.currentStage?.key).toBe("days-4-7");
    expect(dayFive.nextStage).toBeNull();
    expect(dayFive.progress).toBeCloseTo(5 / 7);

    const again = resolveDemoRecoveryState(EXTRACTION_STAGES, {
      simulatedDay: 5,
      recoveryWindowDays: 7,
    });
    expect(again).toEqual(dayFive);
  });

  it("does not invent a current stage when a guide has no timeline", () => {
    const recovery = resolveDemoRecoveryState(
      [
        section({
          key: "introduction",
          kind: "INTRODUCTION",
          title: "About this guide",
          body: "No timeline here.",
        }),
      ],
      DEMO_RECOVERY_FIXTURE
    );

    expect(recovery.hasTimeline).toBe(false);
    expect(recovery.currentStage).toBeNull();
    expect(recovery.nextStage).toBeNull();
    expect(recovery.progress).toBeNull();
    expect(recovery.stages).toEqual([]);
  });

  it("builds Today copy from the resolved stage and kind-driven sections", () => {
    const recovery = resolveDemoRecoveryState(
      EXTRACTION_STAGES,
      DEMO_RECOVERY_FIXTURE
    );
    const today = buildDemoTodayContent(EXTRACTION_STAGES, recovery);

    expect(today.whatToDo?.body).toContain("Leave the site undisturbed today.");
    expect(today.whatIsNormal?.body).toContain("Mild swelling");
    expect(today.warnings?.title).toBe("When to contact us");
    expect(today.comingNext).toEqual({
      periodLabel: "Days 2–3",
      title: "Early recovery",
    });
  });

  it("parses period labels without depending on extraction keys", () => {
    expect(parsePeriodDayRange("First 4 hours", 0, 3, 7)).toEqual({
      startDay: 0,
      endDay: 0,
    });
    expect(parsePeriodDayRange("Week 2+", 0, 3, 14)).toEqual({
      startDay: 8,
      endDay: 14,
    });
    expect(parsePeriodDayRange("Day 1", 0, 3, 7)).toEqual({
      startDay: 1,
      endDay: 1,
    });
  });

  it("prefers structured startDay/endDay over periodLabel parsing", () => {
    const recovery = resolveDemoRecoveryState(
      [
        section({
          key: "misleading-label",
          kind: "RECOVERY_TIMELINE",
          title: "Later healing",
          periodLabel: "Day 1",
          startDay: 4,
          endDay: 7,
          body: "Structured range wins.",
        }),
      ],
      { simulatedDay: 5, recoveryWindowDays: 7 }
    );

    expect(recovery.currentStage?.key).toBe("misleading-label");
    expect(recovery.currentStage?.startDay).toBe(4);
    expect(recovery.currentStage?.endDay).toBe(7);
  });

  it("treats day 0 as the current stage and the first 24 hours as upcoming", () => {
    const recovery = resolveDemoRecoveryState(EXTRACTION_STAGES, {
      simulatedDay: 0,
      recoveryWindowDays: 7,
      simulatedStartDate: "2026-09-10",
    });

    expect(recovery.currentStage?.key).toBe("immediate-care");
    expect(recovery.currentStage).toMatchObject({ startDay: 0, endDay: 0 });
    expect(recovery.nextStage?.key).toBe("first-24-hours");
    expect(recovery.stages.map((stage) => stage.status)).toEqual([
      "current",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
    expect(recovery.simulatedStartDate).toBe("2026-09-10");
    expect(recovery.progress).toBe(0);
  });

  it("keeps the same stage when only the unused demonstration date changes", () => {
    const withoutDate = resolveDemoRecoveryState(EXTRACTION_STAGES, {
      simulatedDay: 1,
      recoveryWindowDays: 7,
    });
    const withDate = resolveDemoRecoveryState(
      EXTRACTION_STAGES,
      DEMO_RECOVERY_FIXTURE
    );

    expect(withDate.stages).toEqual(withoutDate.stages);
    expect(withDate.currentStage?.key).toBe("first-24-hours");
    expect(withDate.simulatedStartDate).toBe("2026-09-10");
  });

  it("marks every overlapping stage current and keeps the first as the Today stage", () => {
    const recovery = resolveDemoRecoveryState(
      [
        section({
          key: "early",
          kind: "RECOVERY_TIMELINE",
          title: "Early",
          startDay: 0,
          endDay: 2,
        }),
        section({
          key: "overlap",
          kind: "RECOVERY_TIMELINE",
          title: "Overlap",
          startDay: 1,
          endDay: 3,
        }),
      ],
      { simulatedDay: 1, recoveryWindowDays: 7 }
    );

    expect(recovery.stages.map((stage) => stage.status)).toEqual([
      "current",
      "current",
    ]);
    expect(recovery.currentStage?.key).toBe("early");
    expect(recovery.nextStage).toBeNull();
  });

  it("does not treat a home-care plan as a recovery timeline", () => {
    const sections = [
      section({
        key: "plan",
        kind: "HOME_CARE_PLAN",
        title: "Home care plan",
        body: "Repeat the movements your practitioner set.",
      }),
      section({
        key: "restrictions",
        kind: "RESTRICTIONS",
        title: "Restrictions",
        body: "Avoid the movement that caused the flare.",
      }),
    ];
    const recovery = resolveDemoRecoveryState(sections, DEMO_RECOVERY_FIXTURE);
    const today = buildDemoTodayContent(sections, recovery);

    expect(recovery.hasTimeline).toBe(false);
    expect(recovery.currentStage).toBeNull();
    expect(today.whatToDo).toBeNull();
    expect(today.warnings).toBeNull();
  });
});
