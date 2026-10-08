import { describe, expect, it } from "vitest";

import {
  instructionLabel,
  parseInstructionTerminology,
  patientGuideLede,
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

  it("builds patient ledes from the clinic's instructions label", () => {
    expect(
      patientIndexLede({
        instructionsLabel: "Post-treatment instructions",
        practiceName: "Riverside Dental Demo",
      })
    ).toBe(
      "Clear post-treatment instructions from Riverside Dental Demo. Open a guide if you have just had treatment, or return to this page whenever you need to check what to do next."
    );
    expect(
      patientIndexLede({
        instructionsLabel: "Home-care instructions",
        practiceName: "Northside Physio",
        placeName: "  Bondi  ",
      })
    ).toBe(
      "Clear home-care instructions from Northside Physio at Bondi. Open a guide if you have just had treatment, or return to this page whenever you need to check what to do next."
    );
    expect(
      patientGuideLede({
        instructionsLabel: "Aftercare instructions",
        practiceName: "Harbour Clinic",
      })
    ).toBe(
      "Aftercare instructions from Harbour Clinic. Read the sections below in order, and contact the practice if you are unsure or need help."
    );
    expect(
      patientPrintLede({
        instructionsLabel: "Recovery instructions",
        practiceName: "Harbour Clinic",
      })
    ).toContain("Recovery instructions from Harbour Clinic.");
    expect(
      patientPrintLede({
        instructionsLabel: "Recovery instructions",
        practiceName: "Harbour Clinic",
      })
    ).not.toContain("recovery information");
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
