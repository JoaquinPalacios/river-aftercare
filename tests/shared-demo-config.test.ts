import { describe, expect, it } from "vitest";

import { SHARED_DEMO_EMERGENCY_INSTRUCTIONS } from "@/lib/dev/shared-demo-brand";
import {
  assessSharedDemoIdentity,
  formatSharedDemoConfigReport,
  planSharedDemoConfig,
  SHARED_DEMO_PROFILE_IDENTITY_UPDATE,
  SHARED_DEMO_RETAINED_BRAND_FIELDS,
  type SharedDemoBrandState,
  type SharedDemoContactState,
  type SharedDemoIdentityInput,
} from "@/lib/dev/shared-demo-config";

const CORPORATE_BLUE = "#3b4bd1";
const CORPORATE_LOGO = "/brand/river-aftercare-isologo.svg";
const PRODUCTION_TEAL = "#0F766E";
const PRODUCTION_ACCENT = "#2DD4BF";
const PRODUCTION_LOGO = "clinics/example-demo/branding/logo.svg";

function brand(
  overrides: Partial<SharedDemoBrandState> = {}
): SharedDemoBrandState {
  return {
    logoUrl: CORPORATE_LOGO,
    darkLogoUrl: CORPORATE_LOGO,
    faviconUrl: null,
    primaryColor: CORPORATE_BLUE,
    accentColor: CORPORATE_BLUE,
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
    ...overrides,
  };
}

function contact(
  overrides: Partial<SharedDemoContactState> = {}
): SharedDemoContactState {
  return {
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
    ...overrides,
  };
}

function identity(input?: {
  clinicId?: string;
  siteId?: string;
  locationId?: string;
  brand?: Partial<SharedDemoBrandState>;
  contact?: Partial<SharedDemoContactState>;
}): SharedDemoIdentityInput {
  const clinic = {
    id: input?.clinicId ?? "clinic_demo_rivers",
    slug: "demodental",
    name: "River Aftercare Demo Clinic",
  };
  const siteBrand = brand(input?.brand);
  const siteContact = contact(input?.contact);
  const site = {
    id: input?.siteId ?? `csite_${clinic.id}`,
    clinicId: clinic.id,
    slug: "demodental",
    name: clinic.name,
    displayName: clinic.name,
    active: true,
    isPrimary: true,
    brand: siteBrand,
  };
  const location = {
    id: input?.locationId ?? `cloc_${clinic.id}`,
    clinicId: clinic.id,
    clinicSiteId: site.id,
    name: clinic.name,
    displayName: clinic.name,
    slug: null,
    active: true,
    servesSiteRoot: true,
    contact: siteContact,
  };
  return {
    clinicsBySlug: [{ ...clinic }],
    clinicById: { ...clinic },
    sitesBySlug: [{ ...site, brand: { ...siteBrand } }],
    siteById: { ...site, brand: { ...siteBrand } },
    primarySites: [{ ...site, brand: { ...siteBrand } }],
    rootLocations: [{ ...location, contact: { ...siteContact } }],
    rootLocationById: { ...location, contact: { ...siteContact } },
    profile: {
      displayName: clinic.name,
      brand: { ...siteBrand },
      contact: { ...siteContact },
    },
  };
}

function planFor(
  snapshot: ReturnType<typeof assessSharedDemoIdentity>,
  options?: Partial<{
    local: boolean;
    apply: boolean;
    allowProduction: boolean;
    confirmSharedDemo: boolean;
    confirmBranding: boolean;
  }>
) {
  return planSharedDemoConfig({
    local: options?.local ?? true,
    apply: options?.apply ?? false,
    allowProduction: options?.allowProduction ?? false,
    confirmSharedDemo: options?.confirmSharedDemo ?? false,
    confirmBranding: options?.confirmBranding ?? false,
    snapshot,
  });
}

describe("shared demo identity", () => {
  it("accepts the local synthetic account and a production-style account", () => {
    const local = assessSharedDemoIdentity(identity(), [
      "DENTAL",
      "PHYSIOTHERAPY",
      "CHIROPRACTIC",
      "COSMETIC_AESTHETIC",
    ]);
    expect(local.identityRefusal).toBeNull();
    expect(local.clinic?.id).toBe("clinic_demo_rivers");
    expect(planFor(local, { apply: true }).action).toBe("noop");

    const production = assessSharedDemoIdentity(
      identity({
        clinicId: "prod_style_demo_account",
        siteId: "prod_style_demo_site",
        locationId: "prod_style_demo_location",
        brand: {
          primaryColor: PRODUCTION_TEAL,
          accentColor: PRODUCTION_ACCENT,
          logoUrl: PRODUCTION_LOGO,
          darkLogoUrl: PRODUCTION_LOGO,
          themeMode: "SYSTEM",
        },
      }),
      ["DENTAL"]
    );
    expect(production.identityRefusal).toBeNull();
    expect(production.clinic?.id).toBe("prod_style_demo_account");
    expect(production.site?.id).toBe("prod_style_demo_site");
    expect(production.location?.id).toBe("prod_style_demo_location");
    const planned = planFor(production, {
      local: false,
      apply: true,
      allowProduction: true,
      confirmSharedDemo: true,
      confirmBranding: true,
    });
    expect(planned.action).toBe("configure");
    expect(planned.writesCategories).toBe(true);
    expect(planned.writesIdentity).toBe(false);
    expect(planned.retainedProfileBrand).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "profile primaryColor",
          current: PRODUCTION_TEAL,
          proposed: PRODUCTION_TEAL,
        }),
        expect.objectContaining({
          label: "profile accentColor",
          current: PRODUCTION_ACCENT,
          proposed: PRODUCTION_ACCENT,
        }),
        expect.objectContaining({
          label: "profile logoUrl",
          current: PRODUCTION_LOGO,
          proposed: PRODUCTION_LOGO,
        }),
      ])
    );
    const report = formatSharedDemoConfigReport(planned);
    expect(report).toContain(`${PRODUCTION_TEAL} → ${PRODUCTION_TEAL}`);
    expect(report).toContain(`${PRODUCTION_LOGO} → ${PRODUCTION_LOGO}`);
    expect(report).toContain("Branding writes: no");
    expect(report).not.toContain(CORPORATE_BLUE);
    expect(report).not.toContain(CORPORATE_LOGO);
  });

  it("refuses missing, ambiguous, and mismatched records", () => {
    const missing = assessSharedDemoIdentity({
      ...identity(),
      clinicsBySlug: [],
      clinicById: null,
    });
    expect(missing.identityRefusal).toMatch(/does not create an account/);

    const ambiguous = identity();
    ambiguous.clinicsBySlug = [
      ...ambiguous.clinicsBySlug,
      {
        id: "second-demodental",
        slug: "demodental",
        name: "Second",
      },
    ];
    expect(assessSharedDemoIdentity(ambiguous).identityRefusal).toMatch(
      /More than one account/
    );

    const wrongAccount = identity();
    wrongAccount.clinicById = {
      id: "someone-else",
      slug: "demodental",
      name: "River Aftercare Demo Clinic",
    };
    expect(assessSharedDemoIdentity(wrongAccount).identityRefusal).toMatch(
      /account id does not match/
    );

    const wrongSiteOwner = identity();
    wrongSiteOwner.sitesBySlug = [
      {
        ...wrongSiteOwner.sitesBySlug[0]!,
        clinicId: "other-account",
      },
    ];
    expect(assessSharedDemoIdentity(wrongSiteOwner).identityRefusal).toMatch(
      /different account/
    );

    const missingSite = identity();
    missingSite.sitesBySlug = [];
    missingSite.siteById = null;
    missingSite.primarySites = [];
    expect(assessSharedDemoIdentity(missingSite).identityRefusal).toMatch(
      /does not create a site/
    );

    const twoPrimary = identity();
    twoPrimary.primarySites = [
      ...twoPrimary.primarySites,
      {
        ...twoPrimary.primarySites[0]!,
        id: "second-primary",
      },
    ];
    expect(assessSharedDemoIdentity(twoPrimary).identityRefusal).toMatch(
      /more than one primary site/
    );

    const missingLocation = identity();
    missingLocation.rootLocations = [];
    missingLocation.rootLocationById = null;
    expect(assessSharedDemoIdentity(missingLocation).identityRefusal).toMatch(
      /does not create a location/
    );

    const twoRoots = identity();
    twoRoots.rootLocations = [
      ...twoRoots.rootLocations,
      {
        ...twoRoots.rootLocations[0]!,
        id: "second-root",
      },
    ];
    expect(assessSharedDemoIdentity(twoRoots).identityRefusal).toMatch(
      /more than one root location/
    );

    const foreignLocation = identity();
    foreignLocation.rootLocations = [
      {
        ...foreignLocation.rootLocations[0]!,
        clinicSiteId: "other-site",
      },
    ];
    expect(assessSharedDemoIdentity(foreignLocation).identityRefusal).toMatch(
      /does not belong to the demodental site/
    );

    const notRoot = identity();
    notRoot.rootLocations = [
      {
        ...notRoot.rootLocations[0]!,
        slug: "west",
        servesSiteRoot: false,
      },
    ];
    notRoot.rootLocationById = {
      ...notRoot.rootLocations[0]!,
    };
    expect(assessSharedDemoIdentity(notRoot).identityRefusal).toMatch(
      /not the site-root location/
    );

    const inactive = identity();
    inactive.sitesBySlug = [{ ...inactive.sitesBySlug[0]!, active: false }];
    inactive.siteById = { ...inactive.sitesBySlug[0]! };
    inactive.primarySites = [{ ...inactive.sitesBySlug[0]! }];
    expect(assessSharedDemoIdentity(inactive).identityRefusal).toMatch(
      /inactive/
    );
  });

  it("keeps category applies from rewriting retained branding", () => {
    const snapshot = assessSharedDemoIdentity(
      identity({
        clinicId: "prod_style_demo_account",
        siteId: "prod_style_demo_site",
        locationId: "prod_style_demo_location",
        brand: {
          primaryColor: PRODUCTION_TEAL,
          accentColor: PRODUCTION_ACCENT,
          logoUrl: PRODUCTION_LOGO,
        },
        contact: { phone: "555" },
      }),
      ["DENTAL"]
    );
    const categoriesOnly = planFor(snapshot, {
      apply: true,
      confirmBranding: false,
    });
    expect(categoriesOnly.writesCategories).toBe(true);
    expect(categoriesOnly.writesIdentity).toBe(false);
    expect(categoriesOnly.reason).toContain("contact details");

    const withIdentity = planFor(snapshot, {
      apply: true,
      confirmBranding: true,
    });
    expect(withIdentity.writesIdentity).toBe(true);
    expect(withIdentity.contactFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "profile phone",
          current: "555",
          proposed: "(empty)",
        }),
      ])
    );
    const written = Object.keys(SHARED_DEMO_PROFILE_IDENTITY_UPDATE);
    for (const field of SHARED_DEMO_RETAINED_BRAND_FIELDS) {
      expect(written).not.toContain(field);
    }

    const again = planFor(
      assessSharedDemoIdentity(
        identity({
          clinicId: "prod_style_demo_account",
          siteId: "prod_style_demo_site",
          locationId: "prod_style_demo_location",
          brand: {
            primaryColor: PRODUCTION_TEAL,
            accentColor: PRODUCTION_ACCENT,
            logoUrl: PRODUCTION_LOGO,
          },
        }),
        ["DENTAL", "PHYSIOTHERAPY", "CHIROPRACTIC", "COSMETIC_AESTHETIC"]
      ),
      { apply: true, confirmBranding: true }
    );
    expect(again.action).toBe("noop");
    expect(again.writesCategories).toBe(false);
    expect(again.writesIdentity).toBe(false);
  });
});
