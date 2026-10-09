import { describe, expect, it } from "vitest";

import { demoPatientGuideLede } from "@/lib/aftercare/demo-patient-presentation";
import {
  instructionLabel,
  parseInstructionTerminology,
  patientFacingGuideLede,
  patientIndexLede,
  patientPrintLede,
  practiceInstructionsTitle,
} from "@/lib/aftercare/instruction-terminology";

describe("instruction terminology", () => {
  it.each([
    ["AFTERCARE", "Aftercare instructions"],
    ["POST_TREATMENT", "Post-treatment instructions"],
    ["POST_PROCEDURE", "Post-procedure instructions"],
    ["POST_OPERATIVE", "Post-operative instructions"],
    ["RECOVERY", "Recovery instructions"],
  ] as const)("maps %s to %s", (value, label) => {
    expect(parseInstructionTerminology(value)).toBe(value);
    expect(instructionLabel(value)).toBe(label);
  });

  it("defaults missing or unsafe values to AFTERCARE", () => {
    expect(parseInstructionTerminology(null)).toBe("AFTERCARE");
    expect(parseInstructionTerminology(undefined)).toBe("AFTERCARE");
    expect(parseInstructionTerminology(" custom heading ")).toBe("AFTERCARE");
    expect(instructionLabel(null)).toBe("Aftercare instructions");
  });

  it("builds a practice title without repeating the guide name", () => {
    expect(
      practiceInstructionsTitle("Riverside Dental Demo", "POST_TREATMENT")
    ).toBe("Riverside Dental Demo — Post-treatment instructions");
    expect(
      practiceInstructionsTitle(
        "Sydney Specialist Oral Surgery",
        "POST_OPERATIVE"
      )
    ).toBe("Sydney Specialist Oral Surgery — Post-operative instructions");
  });
});

describe("patient instructions-label ledes", () => {
  it.each([
    ["AFTERCARE", "Aftercare instructions", "aftercare instructions"],
    [
      "POST_TREATMENT",
      "Post-treatment instructions",
      "post-treatment instructions",
    ],
    [
      "POST_PROCEDURE",
      "Post-procedure instructions",
      "post-procedure instructions",
    ],
    [
      "POST_OPERATIVE",
      "Post-operative instructions",
      "post-operative instructions",
    ],
    ["RECOVERY", "Recovery instructions", "recovery instructions"],
  ] as const)("index and print follow %s", (_value, label, lower) => {
    expect(
      patientIndexLede({
        instructionsLabel: label,
        practiceName: "Harbor Clinic",
      })
    ).toBe(
      `Clear ${lower} from Harbor Clinic. Open a guide if you have just had treatment, or return to this page whenever you need to check what to do next.`
    );
    expect(
      patientIndexLede({
        instructionsLabel: label,
        practiceName: "Harbor Clinic",
        placeName: "North Rooms",
      })
    ).toContain(`Clear ${lower} from Harbor Clinic at North Rooms.`);
    expect(
      patientPrintLede({
        instructionsLabel: label,
        practiceName: "Harbor Clinic",
      })
    ).toBe(
      `${label} from Harbor Clinic. Use your browser’s Print or Save as PDF. This page uses the same information as the web guide.`
    );
  });

  it("does not call an aftercare index or printout a recovery guide", () => {
    const index = patientIndexLede({
      instructionsLabel: "Aftercare instructions",
      practiceName: "Harbor Clinic",
    });
    const print = patientPrintLede({
      instructionsLabel: "Aftercare instructions",
      practiceName: "Harbor Clinic",
    });
    expect(index).not.toContain("recovery information");
    expect(print).not.toContain("Recovery guide");
    expect(print).not.toContain("recovery information");
  });

  it("keeps the public guide lede, including demo Today and home-care sentences", () => {
    expect(
      patientFacingGuideLede({
        clinicSlug: "harbor",
        clinicName: "Harbor Clinic",
        hasTimeline: true,
      })
    ).toBe(
      "Recovery information from Harbor Clinic. Read the sections below in order, and contact the practice if you are unsure or need help."
    );
    expect(
      patientFacingGuideLede({
        clinicSlug: "demodental",
        clinicName: "River Aftercare Demo Clinic",
        hasTimeline: true,
      })
    ).toBe(
      demoPatientGuideLede({
        clinicName: "River Aftercare Demo Clinic",
        hasTimeline: true,
      })
    );
    expect(
      patientFacingGuideLede({
        clinicSlug: "demodental",
        clinicName: "River Aftercare Demo Clinic",
        hasTimeline: false,
      })
    ).toBe(
      "A demonstration of written home-care guidance from River Aftercare Demo Clinic. This is not an individually prescribed plan."
    );
  });
});
