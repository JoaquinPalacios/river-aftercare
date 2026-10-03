/**
 * Clinic guides share the Operator section editor. A guide that already has
 * recovery stages can gain another stage. A Physiotherapy Home Exercise Plan
 * without a timeline stays a home-care guide: the editor says the timeline is
 * absent and does not offer to add one.
 */
export const RECOVERY_TIMELINE_ABSENT_NOTE =
  "This guide does not include a recovery timeline.";

export function clinicGuideOffersTimelineAddition(input: {
  serviceCategory: string | null;
  publicSlug: string;
  title: string;
  templateTitle?: string | null;
  sectionKinds: readonly string[];
}): boolean {
  if (input.sectionKinds.includes("RECOVERY_TIMELINE")) {
    return true;
  }

  const homeExercisePlan =
    input.publicSlug === "home-exercise-plan" ||
    (input.serviceCategory === "PHYSIOTHERAPY" &&
      `${input.title} ${input.templateTitle ?? ""}`
        .toLowerCase()
        .includes("home exercise plan"));

  return !homeExercisePlan;
}
