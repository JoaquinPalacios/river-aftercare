/**
 * Demo-only aftercare flags. Easy to delete once a paying practice ships.
 * Do not treat this as a permanent product feature or as persisted patient state.
 */
export const DEMO_AFTERCARE_TENANT_SLUG = "demodental";

export const DEMO_BANNER_TITLE = "Interactive demo";
export const DEMO_BANNER_COPY =
  "Sample content only · Not clinical advice · Changes aren't saved";

/** @deprecated Use DEMO_BANNER_TITLE / DEMO_BANNER_COPY. Kept for notice tests. */
export const DEMO_AFTERCARE_NOTICE = `${DEMO_BANNER_TITLE}. ${DEMO_BANNER_COPY}`;

export const DEMO_PRINT_SAMPLE_NOTICE = "SAMPLE / NOT CLINICAL ADVICE";

/**
 * Explicit demo fixture. Do not infer recovery day from the real calendar.
 * A future product version requires a persisted RecoveryPlan with startedAt —
 * not Date.now() and not the parked chairside session model.
 *
 * The generic /extraction guide does not know a real patient's treatment day.
 * Before Today is sold as a per-patient capability, an anonymous RecoveryPlan
 * / share-link domain must exist.
 */
export const DEMO_RECOVERY_FIXTURE = {
  simulatedDay: 1,
  recoveryWindowDays: 7,
  /**
   * Explicit Day 0 calendar date for the product demo only.
   * ISO `YYYY-MM-DD`. Never inferred from Date.now() or the browser clock.
   * Day 1 of this fixture is therefore 11 Sep 2026.
   */
  simulatedStartDate: "2026-09-10",
} as const;

const DEMO_AFTERCARE_TENANT_SLUGS = new Set([DEMO_AFTERCARE_TENANT_SLUG]);

export function isDemoTenant(clinicSlug: string): boolean {
  return DEMO_AFTERCARE_TENANT_SLUGS.has(clinicSlug);
}

export function shouldShowDemoAftercareNotice(clinicSlug: string): boolean {
  return isDemoTenant(clinicSlug);
}

export function isDemoPatientExperienceEnabled(clinicSlug: string): boolean {
  return isDemoTenant(clinicSlug);
}
