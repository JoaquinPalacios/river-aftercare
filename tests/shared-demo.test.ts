import { describe, expect, it } from "vitest";

import { clinicCanUseCanonicalTemplate } from "@/lib/aftercare/guide-template-review";
import {
  DESIGNATED_DEMOS,
  designatedDemoAcceptsTemplate,
  designatedDemosForClinicSlug,
} from "@/lib/demo-adoption/designated-demos";
import { planPhysioDemoClinicShell } from "@/lib/dev/physio-demo-seed";
import { planSharedDemoConfig } from "@/lib/dev/shared-demo-config";
import {
  dentalDemoGuideHref,
  exactVerifiedGuideHref,
  SHARED_DEMO_DENTAL_GUIDE_URL,
  SHARED_DEMO_PHYSIO_GUIDE_URL,
} from "@/lib/marketing/shared-demo-links";
import { physiotherapyDemoExampleHref } from "@/lib/marketing/physio-demo-link";
import {
  isSharedDemoHostnameLabel,
  sharedDemoSiteSlugForHostname,
} from "@/lib/tenancy/shared-demo-hostname";
import { createOperatorClinicSchema } from "@/lib/operator/create-operator-clinic";

const snapshot = {
  clinic: {
    id: "clinic_demo_rivers",
    slug: "demodental",
    name: "River Aftercare Demo Clinic",
  },
  site: {
    id: "csite_clinic_demo_rivers",
    slug: "demodental",
    displayName: "River Aftercare Demo Clinic",
  },
  categories: ["DENTAL"] as const,
  profile: {
    displayName: "River Aftercare Demo Clinic",
    logoUrl: "/brand/river-aftercare-isologo.svg",
    phone: null,
    addressLine1: null,
    primaryColor: "#3b4bd1",
    contactEmail: null,
  },
};

describe("shared designated demo", () => {
  it("points every category at the existing demodental account", () => {
    expect(DESIGNATED_DEMOS.map((demo) => demo.clinicSlug)).toEqual([
      "demodental",
      "demodental",
      "demodental",
      "demodental",
    ]);
    expect(designatedDemosForClinicSlug("demodental")).toHaveLength(4);
    expect(designatedDemosForClinicSlug("demophysio")).toEqual([]);
    expect(
      DESIGNATED_DEMOS.find((demo) => demo.serviceCategory === "CHIROPRACTIC")
    ).toMatchObject({
      sampleSlug: "chiropractic-adjustment",
      publicGuideSlug: "chiropractic-adjustment",
      seedPracticeGuide: false,
    });
    expect(
      DESIGNATED_DEMOS.find(
        (demo) => demo.serviceCategory === "COSMETIC_AESTHETIC"
      )?.seedPracticeGuide
    ).toBe(false);
  });

  it("accepts a sample only for the designated slug on the shared account", () => {
    expect(
      designatedDemoAcceptsTemplate({
        clinicSlug: "demodental",
        serviceCategory: "PHYSIOTHERAPY",
        templateSlug: "home-exercise-plan",
      })?.publicGuideSlug
    ).toBe("home-exercise-plan");
    expect(
      designatedDemoAcceptsTemplate({
        clinicSlug: "demodental",
        serviceCategory: "DENTAL",
        templateSlug: "home-exercise-plan",
      })
    ).toBeNull();
    expect(
      designatedDemoAcceptsTemplate({
        clinicSlug: "ordinary-clinic",
        serviceCategory: "DENTAL",
        templateSlug: "extraction",
      })
    ).toBeNull();
    expect(
      clinicCanUseCanonicalTemplate({
        clinicSlug: "demodental",
        serviceCategory: "PHYSIOTHERAPY",
        templateSlug: "home-exercise-plan",
        availability: "sample",
      })
    ).toBe(true);
    expect(
      clinicCanUseCanonicalTemplate({
        clinicSlug: "demodental",
        serviceCategory: "DENTAL",
        templateSlug: "home-exercise-plan",
        availability: "sample",
      })
    ).toBe(false);
    expect(
      clinicCanUseCanonicalTemplate({
        clinicSlug: "ordinary-clinic",
        serviceCategory: "PHYSIOTHERAPY",
        templateSlug: "home-exercise-plan",
        availability: "sample",
      })
    ).toBe(false);
    expect(
      clinicCanUseCanonicalTemplate({
        clinicSlug: "ordinary-clinic",
        serviceCategory: "DENTAL",
        templateSlug: "tooth-extraction",
        availability: "published",
      })
    ).toBe(true);
  });

  it("aliases only the demo hostname onto the existing site slug", () => {
    expect(isSharedDemoHostnameLabel("demo")).toBe(true);
    expect(sharedDemoSiteSlugForHostname("demo")).toBe("demodental");
    expect(sharedDemoSiteSlugForHostname("demodental")).toBeNull();
    expect(sharedDemoSiteSlugForHostname("unknown")).toBeNull();
    expect(sharedDemoSiteSlugForHostname("demophysio")).toBeNull();
  });

  it("rejects claiming the shared hostname or the historical demo slug", () => {
    for (const slug of ["demo", "demodental"]) {
      const parsed = createOperatorClinicSchema.safeParse({
        name: "Not the demo",
        slug,
      });
      expect(parsed.success).toBe(false);
    }
  });

  it("publishes a live example only for the exact shared guide URL", () => {
    expect(
      exactVerifiedGuideHref(
        "https://demo.riveraftercare.com.au/extraction",
        SHARED_DEMO_DENTAL_GUIDE_URL
      )
    ).toBe(SHARED_DEMO_DENTAL_GUIDE_URL);
    expect(
      physiotherapyDemoExampleHref({
        CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL: SHARED_DEMO_PHYSIO_GUIDE_URL,
      })
    ).toBe(SHARED_DEMO_PHYSIO_GUIDE_URL);
    expect(
      physiotherapyDemoExampleHref({
        CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL:
          "https://demophysio.riveraftercare.com.au/home-exercise-plan",
      })
    ).toBeNull();
    expect(
      physiotherapyDemoExampleHref({
        CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL: `${SHARED_DEMO_PHYSIO_GUIDE_URL}?ok=1`,
      })
    ).toBeNull();
    expect(
      dentalDemoGuideHref({}, "https://demodental.riveraftercare.com.au/")
    ).toBe("https://demodental.riveraftercare.com.au/extraction");
    expect(
      dentalDemoGuideHref({
        CARE_GUIDE_SHARED_DEMO_DENTAL_URL: SHARED_DEMO_DENTAL_GUIDE_URL,
      })
    ).toBe(SHARED_DEMO_DENTAL_GUIDE_URL);
  });

  it("refuses to create a second demo clinic and plans category updates without branding", () => {
    expect(planPhysioDemoClinicShell().action).toBe("refuse");
    const missing = planSharedDemoConfig({
      local: false,
      apply: true,
      allowProduction: true,
      confirmSharedDemo: true,
      confirmBranding: false,
      snapshot: { ...snapshot, categories: ["DENTAL"] },
    });
    expect(missing.action).toBe("configure");
    expect(missing.writesCategories).toBe(true);
    expect(missing.writesBranding).toBe(false);
    expect(missing.missingCategories).toEqual([
      "PHYSIOTHERAPY",
      "CHIROPRACTIC",
      "COSMETIC_AESTHETIC",
    ]);
    const remote = planSharedDemoConfig({
      local: false,
      apply: true,
      allowProduction: false,
      confirmSharedDemo: false,
      confirmBranding: true,
      snapshot: { ...snapshot, categories: ["DENTAL"] },
    });
    expect(remote.action).toBe("refuse");
    expect(remote.writesCategories).toBe(false);
    const absent = planSharedDemoConfig({
      local: true,
      apply: true,
      allowProduction: false,
      confirmSharedDemo: false,
      confirmBranding: true,
      snapshot: {
        clinic: null,
        site: null,
        categories: [],
        profile: null,
      },
    });
    expect(absent.action).toBe("refuse");
  });
});
