import { describe, expect, it } from "vitest";

import { clinicGuideOffersTimelineAddition } from "@/lib/clinic-portal/guide-editor-timeline";

describe("clinic guide timeline addition", () => {
  it("offers another stage when a recovery timeline is already present", () => {
    expect(
      clinicGuideOffersTimelineAddition({
        serviceCategory: "PHYSIOTHERAPY",
        publicSlug: "home-exercise-plan",
        title: "Physiotherapy Home Exercise Plan",
        sectionKinds: ["HOME_CARE_PLAN", "RECOVERY_TIMELINE"],
      })
    ).toBe(true);
  });

  it("does not offer a timeline on a physiotherapy home exercise plan", () => {
    expect(
      clinicGuideOffersTimelineAddition({
        serviceCategory: "PHYSIOTHERAPY",
        publicSlug: "shoulder-care",
        title: "Home Exercise Plan",
        sectionKinds: ["HOME_CARE_PLAN"],
      })
    ).toBe(false);
    expect(
      clinicGuideOffersTimelineAddition({
        serviceCategory: "DENTAL",
        publicSlug: "home-exercise-plan",
        title: "Sample",
        sectionKinds: [],
      })
    ).toBe(false);
  });

  it("still offers a timeline for other guides that do not have one", () => {
    expect(
      clinicGuideOffersTimelineAddition({
        serviceCategory: "DENTAL",
        publicSlug: "socket-care",
        title: "Socket care",
        sectionKinds: ["INTRODUCTION"],
      })
    ).toBe(true);
    expect(
      clinicGuideOffersTimelineAddition({
        serviceCategory: "PHYSIOTHERAPY",
        publicSlug: "post-op",
        title: "After physiotherapy treatment",
        sectionKinds: [],
      })
    ).toBe(true);
  });
});
