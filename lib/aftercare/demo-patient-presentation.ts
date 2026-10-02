/**
 * Patient presentation for a designated demonstration.
 * A home-care guide has no recovery timeline, so it is one document.
 */
export function demoPatientViewIds(
  hasTimeline: boolean
): readonly ["today", "timeline", "full-guide"] | readonly ["guide"] {
  if (hasTimeline) {
    return ["today", "timeline", "full-guide"];
  }
  return ["guide"];
}

export function demoPatientGuideLede(input: {
  clinicName: string;
  hasTimeline: boolean;
}): string {
  if (input.hasTimeline) {
    return `What matters today in your recovery from ${input.clinicName}.`;
  }
  return `A demonstration of written home-care guidance from ${input.clinicName}. This is not an individually prescribed plan.`;
}
