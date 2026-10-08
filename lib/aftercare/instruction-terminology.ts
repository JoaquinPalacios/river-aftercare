export const INSTRUCTION_TERMINOLOGY = [
  "AFTERCARE",
  "POST_TREATMENT",
  "POST_PROCEDURE",
  "POST_OPERATIVE",
  "RECOVERY",
] as const;

export type InstructionTerminology = (typeof INSTRUCTION_TERMINOLOGY)[number];

const INSTRUCTION_LABELS: Record<InstructionTerminology, string> = {
  AFTERCARE: "Aftercare instructions",
  POST_TREATMENT: "Post-treatment instructions",
  POST_PROCEDURE: "Post-procedure instructions",
  POST_OPERATIVE: "Post-operative instructions",
  RECOVERY: "Recovery instructions",
};

export function parseInstructionTerminology(
  value: string | null | undefined
): InstructionTerminology {
  if (typeof value !== "string") {
    return "AFTERCARE";
  }

  const normalized = value.trim().toUpperCase();
  if (
    normalized === "AFTERCARE" ||
    normalized === "POST_TREATMENT" ||
    normalized === "POST_PROCEDURE" ||
    normalized === "POST_OPERATIVE" ||
    normalized === "RECOVERY"
  ) {
    return normalized;
  }

  return "AFTERCARE";
}

export function instructionLabel(value: string | null | undefined): string {
  return INSTRUCTION_LABELS[parseInstructionTerminology(value)];
}

export function practiceInstructionsTitle(
  practiceName: string,
  value: string | null | undefined
): string {
  return `${practiceName} — ${instructionLabel(value)}`;
}

function placeSuffix(placeName?: string | null): string {
  const place = placeName?.trim();
  return place ? ` at ${place}` : "";
}

/** Patient index lede. Follows the clinic's chosen instructions label. */
export function patientIndexLede(input: {
  instructionsLabel: string;
  practiceName: string;
  placeName?: string | null;
}): string {
  return `Clear ${input.instructionsLabel.toLowerCase()} from ${input.practiceName}${placeSuffix(input.placeName)}. Open a guide if you have just had treatment, or return to this page whenever you need to check what to do next.`;
}

/** Patient guide lede. The same sentence is used on the public page and in previews. */
export function patientGuideLede(input: {
  instructionsLabel: string;
  practiceName: string;
  placeName?: string | null;
}): string {
  return `${input.instructionsLabel} from ${input.practiceName}${placeSuffix(input.placeName)}. Read the sections below in order, and contact the practice if you are unsure or need help.`;
}

export function patientPrintLede(input: {
  instructionsLabel: string;
  practiceName: string;
}): string {
  return `${input.instructionsLabel} from ${input.practiceName}. Use your browser’s Print or Save as PDF. This page uses the same information as the web guide.`;
}
