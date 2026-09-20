/**
 * Platform-level patient aftercare disclaimer (first-client Model B).
 *
 * River Aftercare is the publishing platform. Clinic content remains
 * clinic-supplied / clinic-approved. This copy is not River Aftercare
 * clinical review, not reviewer/attestation identity, and not schema.org
 * MedicalWebPage / reviewedBy.
 *
 * Practice name is clinic-controlled plain text from PracticeChrome.displayName
 * (`ClinicProfile.displayName`, falling back to `Clinic.name`). Render it as a
 * React text node so it stays escaped. If it is empty after trim, omit the
 * disclaimer rather than producing ungrammatical copy.
 *
 * Contact follow-up is truthful only when PracticeContact (or print contact)
 * will actually render. Publication does not currently require a phone,
 * contact URL, email, address, or emergencyInstructions — those are setup
 * checklist items, not publish gates. `contactEmail` is stored but not shown
 * on patient pages.
 */

export const PATIENT_AFTERCARE_DISCLAIMER_HEADING = "About this guide";

export const PATIENT_AFTERCARE_DISCLAIMER_CONTACT_FOLLOW_UP =
  "If you are unsure about your recovery or need help, contact the practice using the details below.";

export function patientAftercareDisclaimerBody(
  practiceName: string,
  options: { includeContactFollowUp: boolean }
): string {
  const name = practiceName.trim();
  const body = `This aftercare information is provided by ${name} for its patients. It does not replace advice from your treating practitioner. Follow any instructions given directly to you by your practitioner.`;

  if (!options.includeContactFollowUp) {
    return body;
  }

  return `${body} ${PATIENT_AFTERCARE_DISCLAIMER_CONTACT_FOLLOW_UP}`;
}

export function canRenderPatientAftercareDisclaimer(input: {
  isDemoTenant: boolean;
  practiceName: string;
}): boolean {
  return !input.isDemoTenant && Boolean(input.practiceName.trim());
}
