import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { GuideDocument } from "@/app/(aftercare)/components/guide-document";
import {
  PATIENT_PRINT_KEEP_TOGETHER_CHARS,
  patientGuidePrintFlow,
} from "@/lib/aftercare/patient-print-flow";
import type { ComposedGuideSection } from "@/lib/aftercare/types";

describe("patientGuidePrintFlow", () => {
  it("keeps a short block together and lets a long block break", () => {
    expect(patientGuidePrintFlow("Rest today.")).toBe("keep");
    expect(patientGuidePrintFlow("  ")).toBe("keep");
    expect(
      patientGuidePrintFlow("a".repeat(PATIENT_PRINT_KEEP_TOGETHER_CHARS))
    ).toBe("keep");
    expect(
      patientGuidePrintFlow("a".repeat(PATIENT_PRINT_KEEP_TOGETHER_CHARS + 1))
    ).toBe("break");
  });

  it("marks long guide blocks in the shared document", () => {
    const long = "Sentence. ".repeat(80);
    const sections: ComposedGuideSection[] = [
      {
        key: "warning",
        kind: "WARNING_SIGNS",
        title: "Warning signs",
        body: "Call the practice if pain increases.",
        periodLabel: null,
        provenance: "canonical",
      },
      {
        key: "stage",
        kind: "RECOVERY_TIMELINE",
        title: "Later recovery",
        body: long,
        periodLabel: "Week 2",
        provenance: "canonical",
      },
      {
        key: "plan",
        kind: "HOME_CARE_PLAN",
        title: "Home care",
        body: "Follow these instructions.",
        periodLabel: null,
        provenance: "canonical",
        homeCareInstructions: [
          {
            key: "short",
            title: "Short walk",
            body: "Walk once today.",
            frequencyCount: 1,
            frequencyPeriod: "DAY",
            timingLabel: null,
            durationValue: null,
            durationUnit: null,
            sortOrder: 1,
          },
          {
            key: "long",
            title: "Extended note",
            body: long,
            frequencyCount: null,
            frequencyPeriod: null,
            timingLabel: null,
            durationValue: null,
            durationUnit: null,
            sortOrder: 2,
          },
        ],
      },
    ];

    const html = renderToStaticMarkup(<GuideDocument sections={sections} />);
    expect(html).toContain('data-print-flow="keep"');
    expect(html).toContain('data-print-flow="break"');
    expect(html.match(/data-print-flow="break"/g)).toHaveLength(2);
  });
});
