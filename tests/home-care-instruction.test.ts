import { describe, expect, it } from "vitest";

import { formatHomeCareInstructionSummary } from "@/lib/aftercare/home-care-instruction";
import { guideSectionDraftSchema } from "@/lib/clinic-portal/guide-schemas";

function item(overrides: Record<string, unknown> = {}) {
  return {
    key: "item-one",
    title: "Sample instruction",
    body: null,
    frequencyCount: null,
    frequencyPeriod: null,
    timingLabel: null,
    durationValue: null,
    durationUnit: null,
    ...overrides,
  };
}

function section(overrides: Record<string, unknown> = {}) {
  return {
    key: "plan",
    kind: "HOME_CARE_PLAN" as const,
    title: "Home care plan",
    body: "",
    periodLabel: null,
    startDay: null,
    endDay: null,
    homeCareInstructions: [item()],
    ...overrides,
  };
}

describe("home-care instruction validation", () => {
  it("accepts three times per week for four weeks", () => {
    const parsed = guideSectionDraftSchema.parse(
      section({
        homeCareInstructions: [
          item({
            frequencyCount: 3,
            frequencyPeriod: "WEEK",
            durationValue: 4,
            durationUnit: "WEEKS",
          }),
        ],
      })
    );
    expect(parsed.homeCareInstructions[0]).toMatchObject({
      frequencyCount: 3,
      frequencyPeriod: "WEEK",
      durationValue: 4,
      durationUnit: "WEEKS",
    });
  });

  it("accepts once daily in the evening for seven days", () => {
    const parsed = guideSectionDraftSchema.parse(
      section({
        homeCareInstructions: [
          item({
            frequencyCount: 1,
            frequencyPeriod: "DAY",
            timingLabel: "Evening",
            durationValue: 7,
            durationUnit: "DAYS",
          }),
        ],
      })
    );
    expect(parsed.homeCareInstructions[0]).toMatchObject({
      frequencyCount: 1,
      frequencyPeriod: "DAY",
      timingLabel: "Evening",
      durationValue: 7,
      durationUnit: "DAYS",
    });
  });

  it("accepts a duration-only restriction and omitted schedule fields", () => {
    const durationOnly = guideSectionDraftSchema.parse(
      section({
        homeCareInstructions: [
          item({ durationValue: 2, durationUnit: "WEEKS" }),
        ],
      })
    );
    expect(durationOnly.homeCareInstructions[0]).toMatchObject({
      frequencyCount: null,
      frequencyPeriod: null,
      durationValue: 2,
      durationUnit: "WEEKS",
    });

    const open = guideSectionDraftSchema.parse(section());
    expect(open.homeCareInstructions[0]).toMatchObject({
      frequencyCount: null,
      durationValue: null,
      timingLabel: null,
    });
  });

  it("rejects a count or duration without its pair, and out-of-range values", () => {
    expect(
      guideSectionDraftSchema.safeParse(
        section({
          homeCareInstructions: [item({ frequencyCount: 3 })],
        })
      ).success
    ).toBe(false);
    expect(
      guideSectionDraftSchema.safeParse(
        section({
          homeCareInstructions: [item({ durationUnit: "DAYS" })],
        })
      ).success
    ).toBe(false);
    expect(
      guideSectionDraftSchema.safeParse(
        section({
          homeCareInstructions: [
            item({ frequencyCount: 0, frequencyPeriod: "DAY" }),
          ],
        })
      ).success
    ).toBe(false);
    expect(
      guideSectionDraftSchema.safeParse(
        section({
          homeCareInstructions: [
            item({ durationValue: 521, durationUnit: "WEEKS" }),
          ],
        })
      ).success
    ).toBe(false);
  });

  it("strips instructions from non-plan sections and requires one plan item", () => {
    const plain = guideSectionDraftSchema.parse({
      key: "intro",
      kind: "INTRODUCTION",
      title: "Introduction",
      body: "Plain guidance.",
      periodLabel: null,
      startDay: null,
      endDay: null,
      homeCareInstructions: [item()],
    });
    expect(plain.homeCareInstructions).toEqual([]);
    expect(
      guideSectionDraftSchema.safeParse(section({ homeCareInstructions: [] }))
        .success
    ).toBe(false);
  });
});

describe("home-care instruction summary", () => {
  it("formats frequency, timing, and duration-only lines", () => {
    expect(
      formatHomeCareInstructionSummary({
        frequencyCount: 3,
        frequencyPeriod: "WEEK",
        timingLabel: null,
        durationValue: 4,
        durationUnit: "WEEKS",
      })
    ).toBe("3 times per week · 4 weeks");
    expect(
      formatHomeCareInstructionSummary({
        frequencyCount: 1,
        frequencyPeriod: "DAY",
        timingLabel: "Evening",
        durationValue: 7,
        durationUnit: "DAYS",
      })
    ).toBe("Once daily · Evening · 7 days");
    expect(
      formatHomeCareInstructionSummary({
        frequencyCount: null,
        frequencyPeriod: null,
        timingLabel: null,
        durationValue: 2,
        durationUnit: "WEEKS",
      })
    ).toBe("For 2 weeks");
    expect(
      formatHomeCareInstructionSummary({
        frequencyCount: null,
        frequencyPeriod: null,
        timingLabel: null,
        durationValue: null,
        durationUnit: null,
      })
    ).toBeNull();
  });
});
