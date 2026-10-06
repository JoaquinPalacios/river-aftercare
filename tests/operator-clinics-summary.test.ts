import { describe, expect, it } from "vitest";

import { selectOperatorClinicActivity } from "@/lib/operator/list-operator-clinics";
import { summarizeOperatorClinics } from "@/lib/operator/summarize-operator-clinics";

describe("operator clinic summary", () => {
  it("derives totals from real clinic rows", () => {
    expect(
      summarizeOperatorClinics([
        {
          publishedGuideCount: 1,
          setupLabel: "Configured",
        },
        {
          publishedGuideCount: 0,
          setupLabel: "Needs attention",
        },
      ])
    ).toEqual({
      totalClinics: 2,
      configuredClinics: 1,
      publishedGuides: 1,
      needsAttention: 1,
    });
  });

  it("keeps inactive clinics out of the operational summary", () => {
    const clinics = [
      {
        id: "active",
        inactive: false,
        publishedGuideCount: 2,
        setupLabel: "Needs attention",
      },
      {
        id: "inactive",
        inactive: true,
        publishedGuideCount: 4,
        setupLabel: "Configured",
      },
    ];
    const active = selectOperatorClinicActivity(clinics, "active");
    const inactive = selectOperatorClinicActivity(clinics, "inactive");
    expect(active.map((clinic) => clinic.id)).toEqual(["active"]);
    expect(inactive.map((clinic) => clinic.id)).toEqual(["inactive"]);
    const withRetired = [
      ...clinics,
      {
        id: "retired",
        inactive: false,
        permanentlyDeleted: true,
        publishedGuideCount: 9,
        setupLabel: "Configured",
      },
    ];
    expect(
      selectOperatorClinicActivity(withRetired, "active").map(
        (clinic) => clinic.id
      )
    ).toEqual(["active"]);
    expect(
      selectOperatorClinicActivity(withRetired, "inactive").map(
        (clinic) => clinic.id
      )
    ).toEqual(["inactive"]);
    expect(
      selectOperatorClinicActivity(withRetired, "retired").map(
        (clinic) => clinic.id
      )
    ).toEqual(["retired"]);
    expect(summarizeOperatorClinics(active)).toEqual({
      totalClinics: 1,
      configuredClinics: 0,
      publishedGuides: 2,
      needsAttention: 1,
    });
  });
});
