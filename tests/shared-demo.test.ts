import { describe, expect, it } from "vitest";

import { clinicCanUseCanonicalTemplate } from "@/lib/aftercare/guide-template-review";
import {
  DESIGNATED_DEMOS,
  designatedDemoAcceptsTemplate,
  designatedDemosForClinicSlug,
} from "@/lib/demo-adoption/designated-demos";
import { readFileSync } from "node:fs";

import { planPhysioDemoClinicShell } from "@/lib/dev/physio-demo-seed";
import {
  assessSharedDemoIdentity,
  planSharedDemoConfig,
  type SharedDemoIdentityInput,
} from "@/lib/dev/shared-demo-config";
import {
  dentalDemoGuideHref,
  exactVerifiedGuideHref,
  SHARED_DEMO_DENTAL_GUIDE_ILLUSTRATION,
  SHARED_DEMO_DENTAL_GUIDE_URL,
  SHARED_DEMO_PHYSIO_GUIDE_URL,
} from "@/lib/marketing/shared-demo-links";
import { physiotherapyDemoExampleHref } from "@/lib/marketing/physio-demo-link";
import { clinicPatientSiteUrl } from "@/lib/clinic-portal/patient-site-url";
import {
  canonicalPublicHost,
  isSharedDemoHostnameLabel,
  publicHostnameLabelForSiteSlug,
  sharedDemoSiteSlugForHostname,
} from "@/lib/tenancy/shared-demo-hostname";
import { createOperatorClinicSchema } from "@/lib/operator/create-operator-clinic";
import { SHARED_DEMO_EMERGENCY_INSTRUCTIONS } from "@/lib/dev/shared-demo-brand";

function localIdentity(): SharedDemoIdentityInput {
  const clinic = {
    id: "clinic_demo_rivers",
    slug: "demodental",
    name: "River Aftercare Demo Clinic",
  };
  const brand = {
    logoUrl: "/brand/river-aftercare-isologo.svg",
    darkLogoUrl: "/brand/river-aftercare-isologo.svg",
    faviconUrl: null,
    primaryColor: "#3b4bd1",
    accentColor: "#3b4bd1",
    darkPrimaryColor: "#8ea0ff",
    darkAccentColor: "#8ea0ff",
    useCustomDarkBranding: true,
    neutralColor: "#f7f8ff",
    radiusPreset: "MEDIUM",
    typeface: null,
    instructionTerminology: "AFTERCARE",
    themeMode: "SYSTEM",
    allowPatientThemeToggle: true,
    showCareGuideAttribution: true,
  };
  const contact = {
    phone: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    region: null,
    postalCode: null,
    country: null,
    bookingUrl: null,
    contactUrl: null,
    contactEmail: null,
    emergencyInstructions: SHARED_DEMO_EMERGENCY_INSTRUCTIONS,
  };
  const site = {
    id: "csite_clinic_demo_rivers",
    clinicId: clinic.id,
    slug: "demodental",
    name: clinic.name,
    displayName: clinic.name,
    active: true,
    isPrimary: true,
    brand,
  };
  const location = {
    id: "cloc_clinic_demo_rivers",
    clinicId: clinic.id,
    clinicSiteId: site.id,
    name: clinic.name,
    displayName: clinic.name,
    slug: null,
    active: true,
    servesSiteRoot: true,
    contact,
  };
  return {
    clinicsBySlug: [clinic],
    clinicById: { ...clinic },
    sitesBySlug: [site],
    siteById: { ...site, brand: { ...brand } },
    primarySites: [{ ...site, brand: { ...brand } }],
    rootLocations: [location],
    rootLocationById: { ...location, contact: { ...contact } },
    profile: {
      displayName: clinic.name,
      brand: { ...brand },
      contact: { ...contact },
    },
  };
}

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

  it("publishes the shared demo on the preferred hostname and leaves other sites alone", () => {
    const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;
    process.env.CARE_GUIDE_ROOT_DOMAIN = "riveraftercare.com.au";
    try {
      expect(publicHostnameLabelForSiteSlug("demodental")).toBe("demo");
      expect(publicHostnameLabelForSiteSlug("harbordental")).toBe(
        "harbordental"
      );
      expect(publicHostnameLabelForSiteSlug("demo")).toBe("demo");

      for (const demo of DESIGNATED_DEMOS) {
        expect(
          clinicPatientSiteUrl({
            requestHost: "app.riveraftercare.com.au",
            clinicSlug: demo.clinicSlug,
            protocol: "https",
            pathname: `/${demo.publicGuideSlug}`,
          })
        ).toBe(`https://demo.riveraftercare.com.au/${demo.publicGuideSlug}`);
      }

      expect(
        clinicPatientSiteUrl({
          requestHost: "app.riveraftercare.com.au",
          clinicSlug: "harbordental",
          protocol: "https",
          pathname: "/extraction",
        })
      ).toBe("https://harbordental.riveraftercare.com.au/extraction");
      expect(
        clinicPatientSiteUrl({
          requestHost: "app.riveraftercare.com.au",
          clinicSlug: "demodental",
          protocol: "https",
          pathname: "/extraction/print",
        })
      ).toBe("https://demo.riveraftercare.com.au/extraction/print");
    } finally {
      if (previousRoot === undefined) {
        delete process.env.CARE_GUIDE_ROOT_DOMAIN;
      } else {
        process.env.CARE_GUIDE_ROOT_DOMAIN = previousRoot;
      }
    }
  });

  it("canonicalizes only the historical shared-demo host onto the preferred host", () => {
    expect(
      canonicalPublicHost(
        "demodental.riveraftercare.com.au",
        "riveraftercare.com.au"
      )
    ).toBe("demo.riveraftercare.com.au");
    expect(canonicalPublicHost("demodental.localhost:3000", "localhost")).toBe(
      "demo.localhost:3000"
    );
    expect(
      canonicalPublicHost("demo.riveraftercare.com.au", "riveraftercare.com.au")
    ).toBe("demo.riveraftercare.com.au");
    expect(
      canonicalPublicHost(
        "harbordental.riveraftercare.com.au",
        "riveraftercare.com.au"
      )
    ).toBe("harbordental.riveraftercare.com.au");
    expect(
      canonicalPublicHost("demodental.example.test", "riveraftercare.com.au")
    ).toBe("demodental.example.test");
    expect(canonicalPublicHost("demodental.localhost:3000", "")).toBe(
      "demodental.localhost:3000"
    );
  });

  it("rejects claiming the shared hostname or the historical demo slug", () => {
    for (const slug of ["demo", "demodental"]) {
      const parsed = createOperatorClinicSchema.safeParse({
        name: "Not the demo",
        slug,
        serviceCategories: ["DENTAL"],
      });
      expect(parsed.success).toBe(false);
    }
  });

  it("publishes a live example only for the exact shared guide URL", () => {
    expect(SHARED_DEMO_DENTAL_GUIDE_URL).toBe(
      "https://demo.riveraftercare.com.au/extraction"
    );
    expect(SHARED_DEMO_DENTAL_GUIDE_ILLUSTRATION).toBe(
      "demo.riveraftercare.com.au/extraction"
    );
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
    ).toBe(SHARED_DEMO_DENTAL_GUIDE_URL);
    expect(
      dentalDemoGuideHref({
        CARE_GUIDE_SHARED_DEMO_DENTAL_URL: SHARED_DEMO_DENTAL_GUIDE_URL,
      })
    ).toBe(SHARED_DEMO_DENTAL_GUIDE_URL);
  });

  it("refuses to create a second demo clinic and plans category updates without branding", () => {
    expect(planPhysioDemoClinicShell().action).toBe("refuse");
    const provision = readFileSync(
      "scripts/provision-physio-demo-clinic.mjs",
      "utf8"
    );
    expect(provision).toContain("process.exit(1)");
    expect(provision).not.toContain("PrismaClient");
    expect(provision).not.toContain("DATABASE_URL");
    const missing = planSharedDemoConfig({
      local: false,
      apply: true,
      allowProduction: true,
      confirmSharedDemo: true,
      confirmBranding: false,
      snapshot: assessSharedDemoIdentity(localIdentity(), ["DENTAL"]),
    });
    expect(missing.action).toBe("configure");
    expect(missing.writesCategories).toBe(true);
    expect(missing.writesIdentity).toBe(false);
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
      snapshot: assessSharedDemoIdentity(localIdentity(), ["DENTAL"]),
    });
    expect(remote.action).toBe("refuse");
    expect(remote.writesCategories).toBe(false);
    expect(remote.writesIdentity).toBe(false);
    const absent = planSharedDemoConfig({
      local: true,
      apply: true,
      allowProduction: false,
      confirmSharedDemo: false,
      confirmBranding: true,
      snapshot: assessSharedDemoIdentity({
        clinicsBySlug: [],
        clinicById: null,
        sitesBySlug: [],
        siteById: null,
        primarySites: [],
        rootLocations: [],
        rootLocationById: null,
        profile: null,
      }),
    });
    expect(absent.action).toBe("refuse");
    expect(absent.reason).toContain("does not create an account");
  });
});
