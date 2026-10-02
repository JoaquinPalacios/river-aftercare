/**
 * Printed guides keep a short block on one page. A longer block may split so
 * Chromium does not move the whole block and leave a blank region behind it.
 *
 * The cutoff is a character count, not a CSS height. About eight lines of the
 * 11pt print measure stay together; anything longer is allowed to fragment.
 * Headings still use break-after: avoid, so a split starts after the title.
 */
export const PATIENT_PRINT_KEEP_TOGETHER_CHARS = 560;

export function patientGuidePrintFlow(text: string): "keep" | "break" {
  if (text.trim().length > PATIENT_PRINT_KEEP_TOGETHER_CHARS) {
    return "break";
  }
  return "keep";
}
