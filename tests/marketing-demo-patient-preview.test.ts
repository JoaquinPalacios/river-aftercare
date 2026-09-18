import { describe, expect, it } from "vitest";

import { DEMO_EXTRACTION_CANONICAL_SECTIONS } from "@/lib/aftercare/demo-extraction-template-payload.mjs";
import {
  MARKETING_DEMO_CURRENT_STAGE_SUMMARY,
  MARKETING_DEMO_TIMELINE,
  MARKETING_DEMO_TODAY_DO_BODY,
} from "@/lib/marketing/demo-patient-preview";

function canonicalSection(key: string) {
  const section = DEMO_EXTRACTION_CANONICAL_SECTIONS.find(
    (entry) => entry.key === key
  );
  expect(section, `canonical section ${key}`).toBeDefined();
  return section!;
}

describe("marketing demo patient preview fixtures", () => {
  it("reuses Tooth Extraction sample fields for upcoming stage previews", () => {
    const immediateCare = canonicalSection("immediate-care");
    const earlyRecovery = canonicalSection("days-2-3");
    const healingCheck = canonicalSection("days-4-7");

    expect(MARKETING_DEMO_TODAY_DO_BODY).toBe(immediateCare.body);
    expect(MARKETING_DEMO_TIMELINE).toHaveLength(3);

    const [current, daysTwoThree, daysFourSeven] = MARKETING_DEMO_TIMELINE;

    expect(current).toMatchObject({
      key: "immediate-care",
      period: immediateCare.periodLabel,
      title: immediateCare.title,
      summary: MARKETING_DEMO_CURRENT_STAGE_SUMMARY,
      status: "current",
    });
    expect(current.summary).not.toBe(immediateCare.body);

    expect(daysTwoThree).toEqual({
      key: "days-2-3",
      period: earlyRecovery.periodLabel,
      title: earlyRecovery.title,
      summary: "Swelling often peaks, then eases.",
      status: "upcoming",
    });
    expect(daysFourSeven).toEqual({
      key: "days-4-7",
      period: healingCheck.periodLabel,
      title: healingCheck.title,
      summary: "Discomfort should continue to settle.",
      status: "upcoming",
    });
    expect(earlyRecovery.body.startsWith(daysTwoThree.summary)).toBe(true);
    expect(healingCheck.body.startsWith(daysFourSeven.summary)).toBe(true);
    expect(daysTwoThree.summary).not.toBe(earlyRecovery.body);
    expect(daysFourSeven.summary).not.toBe(healingCheck.body);
  });
});
