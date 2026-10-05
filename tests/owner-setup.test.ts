import { readFileSync } from "node:fs";

import { GuideRevisionStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { filterEligibleCanonicalTemplates } from "@/lib/clinic-portal/list-canonical-templates";
import {
  deriveOwnerSetup,
  type OwnerSetupGuide,
  type OwnerSetupInput,
  type OwnerSetupSummary,
} from "@/lib/clinic-portal/owner-setup";
import type { ClinicSetupInput } from "@/lib/clinic-portal/setup-status";

const FRESH_PROFILE: ClinicSetupInput = {
  displayName: "Harbour Dental",
  logoUrl: null,
  primaryColor: null,
  accentColor: null,
  themeMode: "SYSTEM",
  phone: null,
  contactUrl: null,
  emergencyInstructions: null,
  publishedGuideCount: 0,
};

const COMPLETE_PROFILE: ClinicSetupInput = {
  displayName: "Harbour Dental",
  logoUrl: "/demo/riverside-mark.svg",
  primaryColor: "#155e75",
  accentColor: "#b45309",
  themeMode: "SYSTEM",
  phone: "0255500100",
  contactUrl: "https://example.com/contact",
  emergencyInstructions: "Call the clinic or emergency services.",
  publishedGuideCount: 0,
};

const DENTAL_TEMPLATE = {
  id: "tpl_dental",
  title: "Tooth extraction care",
  serviceCategory: "DENTAL" as const,
  alreadyAdded: false,
};

const COSMETIC_TEMPLATE = {
  id: "tpl_cosmetic",
  title: "Chemical peel care",
  serviceCategory: "COSMETIC_AESTHETIC" as const,
  alreadyAdded: false,
};

function input(overrides: Partial<OwnerSetupInput> = {}): OwnerSetupInput {
  return {
    audience: "admin",
    profile: FRESH_PROFILE,
    serviceCategories: ["DENTAL"],
    sitesHref: "/practice/sites/site_1",
    templates: [DENTAL_TEMPLATE],
    guides: [],
    customGuidePermitted: true,
    ...overrides,
  };
}

function item(
  summary: OwnerSetupSummary,
  id: OwnerSetupSummary["items"][number]["id"]
) {
  const found = summary.items.find((row) => row.id === id);
  if (!found) {
    throw new Error(`Missing setup item ${id}`);
  }
  return found;
}

function draftGuide(overrides: Partial<OwnerSetupGuide> = {}): OwnerSetupGuide {
  return {
    id: "guide_1",
    title: "After extraction",
    status: "DRAFT",
    retained: false,
    guideTemplateId: null,
    sourceGuideTemplateId: null,
    ...overrides,
  };
}

function expectNoPaymentInstructions(summary: OwnerSetupSummary) {
  const text = JSON.stringify(summary);
  expect(summary.items.map((row) => row.id)).not.toContain("payment");
  expect(text).not.toMatch(/authori[sz]e payment/i);
  expect(text).not.toMatch(/checkout/i);
  expect(text).not.toMatch(/billing setup/i);
}

describe("owner setup derivation", () => {
  it("shows the first administrator what an assisted complimentary clinic still needs", () => {
    const summary = deriveOwnerSetup(input());

    expect(item(summary, "practice").state).toBe("needs_attention");
    expect(item(summary, "contact").state).toBe("needs_attention");
    expect(item(summary, "emergency").state).toBe("needs_attention");
    expect(item(summary, "categories")).toMatchObject({
      state: "configured",
      detail: "Dental",
      actions: [],
    });
    expect(item(summary, "guide").state).toBe("needs_attention");
    expect(item(summary, "published").state).toBe("needs_attention");
    expect(item(summary, "practice").actions).toEqual([
      {
        href: "/practice#practice-identity",
        label: "Complete Practice details",
      },
    ]);
    expect(item(summary, "contact").actions[0]?.label).toBe(
      "Add clinic contact"
    );
    expect(item(summary, "emergency").actions[0]?.label).toBe(
      "Add emergency instructions"
    );
    expect(
      item(summary, "guide").actions.map((action) => action.label)
    ).toEqual(["Review templates", "Create a custom guide"]);
    expect(summary.templateGroups).toEqual([
      {
        serviceCategory: "DENTAL",
        label: "Dental",
        templates: [
          {
            id: "tpl_dental",
            title: "Tooth extraction care",
            serviceCategory: "DENTAL",
            categoryLabel: "Dental",
            alreadyAdded: false,
          },
        ],
      },
    ]);
    expect(summary.ready).toBe(false);
    expectNoPaymentInstructions(summary);
  });

  it("keeps a stored theme default incomplete until logo and colours exist", () => {
    const summary = deriveOwnerSetup(input());
    expect(item(summary, "practice").detail).toMatch(/logo/i);
    expect(item(summary, "practice").detail).toMatch(/colour/i);
    expect(item(summary, "practice").state).toBe("needs_attention");
  });

  it("omits payment instructions for a paid-active clinic", () => {
    const summary = deriveOwnerSetup(
      input({
        profile: { ...COMPLETE_PROFILE, publishedGuideCount: 1 },
        guides: [draftGuide({ status: "PUBLISHED" })],
      })
    );
    expect(summary.ready).toBe(true);
    expectNoPaymentInstructions(summary);
    expect(summary.items.every((row) => row.actions.length === 0)).toBe(true);
  });

  it("hides administrative actions from staff", () => {
    const summary = deriveOwnerSetup(input({ audience: "staff" }));
    expect(summary.audience).toBe("staff");
    expect(summary.items.flatMap((row) => row.actions)).toEqual([]);
    expect(item(summary, "practice").state).toBe("needs_attention");
    expect(item(summary, "categories").detail).toBe("Dental");
  });

  it("lists only the dental templates supplied for a dental clinic", () => {
    const summary = deriveOwnerSetup(
      input({
        serviceCategories: ["DENTAL"],
        templates: [DENTAL_TEMPLATE],
      })
    );
    expect(
      summary.templateGroups.map((group) => group.serviceCategory)
    ).toEqual(["DENTAL"]);
    expect(summary.templateGroups[0]?.templates.map((row) => row.id)).toEqual([
      "tpl_dental",
    ]);
  });

  it("unions templates across a multidisciplinary clinic and names an empty category", () => {
    const summary = deriveOwnerSetup(
      input({
        serviceCategories: ["COSMETIC_AESTHETIC", "DENTAL"],
        templates: [DENTAL_TEMPLATE],
      })
    );
    expect(summary.templateGroups.map((group) => group.label)).toEqual([
      "Dental",
      "Cosmetic & Aesthetic",
    ]);
    expect(summary.templateGroups[0]?.templates).toHaveLength(1);
    expect(summary.templateGroups[1]?.templates).toEqual([]);
    expect(item(summary, "categories").detail).toBe(
      "Dental, Cosmetic & Aesthetic"
    );
  });

  it("offers the custom-guide path when no eligible template exists", () => {
    const summary = deriveOwnerSetup(
      input({
        serviceCategories: ["CHIROPRACTIC"],
        templates: [],
      })
    );
    expect(summary.templateGroups).toEqual([
      {
        serviceCategory: "CHIROPRACTIC",
        label: "Chiropractic",
        templates: [],
      },
    ]);
    expect(item(summary, "guide").detail).toMatch(
      /No published template is available/
    );
    expect(item(summary, "guide").detail).not.toMatch(/template is ready/i);
    expect(item(summary, "guide").actions).toEqual([
      {
        href: "/guides/new#custom-guide",
        label: "Create a custom guide",
      },
    ]);
  });

  it("withholds the custom-guide path when the plan has no place left", () => {
    const summary = deriveOwnerSetup(
      input({
        serviceCategories: ["CHIROPRACTIC"],
        templates: [],
        customGuidePermitted: false,
      })
    );
    expect(item(summary, "guide").actions).toEqual([]);
    expect(item(summary, "guide").detail).toMatch(/no custom-guide place/i);
  });

  it("marks practice, contact, and emergency configured from completed practice fields", () => {
    const summary = deriveOwnerSetup(input({ profile: COMPLETE_PROFILE }));
    expect(item(summary, "practice").state).toBe("configured");
    expect(item(summary, "contact").state).toBe("configured");
    expect(item(summary, "emergency").state).toBe("configured");
    expect(item(summary, "guide").state).toBe("needs_attention");
    expect(item(summary, "published").state).toBe("needs_attention");
    expect(item(summary, "practice").actions).toEqual([]);
  });

  it("marks the first saved guide and points an administrator at preview and publish", () => {
    const summary = deriveOwnerSetup(
      input({
        profile: COMPLETE_PROFILE,
        guides: [draftGuide()],
      })
    );
    expect(item(summary, "guide")).toMatchObject({
      state: "configured",
      detail: "1 custom guide is saved.",
      actions: [],
    });
    expect(item(summary, "published").actions).toEqual([
      {
        href: "/guides/guide_1/edit",
        label: "Preview and publish",
      },
    ]);
    expect(summary.showTemplateCatalogue).toBe(true);
  });

  it("marks the clinic ready after the first guide is published", () => {
    const summary = deriveOwnerSetup(
      input({
        profile: { ...COMPLETE_PROFILE, publishedGuideCount: 1 },
        guides: [
          draftGuide({ status: "PUBLISHED", guideTemplateId: "tpl_dental" }),
        ],
      })
    );
    expect(item(summary, "guide").detail).toBe("1 template guide is saved.");
    expect(item(summary, "published").state).toBe("configured");
    expect(item(summary, "published").actions).toEqual([]);
    expect(summary.showTemplateCatalogue).toBe(false);
    expect(summary.ready).toBe(true);
  });

  it("returns the same summary when the same clinic state is read again", () => {
    const first = deriveOwnerSetup(input({ profile: COMPLETE_PROFILE }));
    const second = deriveOwnerSetup(input({ profile: COMPLETE_PROFILE }));
    expect(second).toEqual(first);
  });

  it("does not persist a wizard flag or start checkout from the setup modules", () => {
    const derivation = readFileSync("lib/clinic-portal/owner-setup.ts", "utf8");
    const loader = readFileSync(
      "lib/clinic-portal/load-owner-setup.ts",
      "utf8"
    );
    const page = readFileSync(
      "app/(staff)/(clinic-portal)/dashboard/page.tsx",
      "utf8"
    );
    const layout = readFileSync(
      "app/(staff)/(clinic-portal)/layout.tsx",
      "utf8"
    );
    for (const source of [derivation, loader, page]) {
      expect(source).not.toMatch(/onboardingCompleted|setupCompleted/);
      expect(source).not.toContain("checkout.sessions");
      expect(source).not.toContain("createPracticeGuideFromTemplate");
      expect(source).not.toContain("createCustomPracticeGuide");
      expect(source).not.toContain("publishPracticeGuide");
    }
    expect(layout).toContain("enforcePrePaymentActivationGate");
    expect(layout).toContain("PortalChrome");
    expect(page).not.toContain("redirect(");
  });
});

describe("canonical template eligibility for owner setup", () => {
  const dentalProduction = {
    id: "tpl_dental",
    slug: "tooth-extraction-care",
    title: "Tooth extraction care",
    serviceCategory: "DENTAL" as const,
    isSample: false,
    revisions: [
      {
        id: "rev_dental",
        version: 1,
        status: GuideRevisionStatus.PUBLISHED,
      },
    ],
  };
  const cosmeticProduction = {
    id: "tpl_cosmetic",
    slug: "chemical-peel-care",
    title: "Chemical peel care",
    serviceCategory: "COSMETIC_AESTHETIC" as const,
    isSample: false,
    revisions: [
      {
        id: "rev_cosmetic",
        version: 1,
        status: GuideRevisionStatus.PUBLISHED,
      },
    ],
  };
  const dentalSample = {
    id: "tpl_sample",
    slug: "extraction",
    title: "Tooth Extraction",
    serviceCategory: "DENTAL" as const,
    isSample: true,
    revisions: [
      {
        id: "rev_sample",
        version: 1,
        status: GuideRevisionStatus.PUBLISHED,
      },
    ],
  };
  const dentalDraft = {
    id: "tpl_draft",
    slug: "unpublished-dental",
    title: "Unpublished dental",
    serviceCategory: "DENTAL" as const,
    isSample: false,
    revisions: [
      { id: "rev_draft", version: 1, status: GuideRevisionStatus.DRAFT },
    ],
  };

  it("shows a dental production template and hides samples, drafts, and other categories", () => {
    const listed = filterEligibleCanonicalTemplates({
      clinicSlug: "harbour-dental",
      serviceCategories: ["DENTAL"],
      templates: [
        dentalProduction,
        cosmeticProduction,
        dentalSample,
        dentalDraft,
      ],
    });
    expect(listed.map((template) => template.id)).toEqual(["tpl_dental"]);
    expect(
      listed.every((template) => template.availability === "published")
    ).toBe(true);
  });

  it("unions eligible production templates for a multidisciplinary clinic", () => {
    const listed = filterEligibleCanonicalTemplates({
      clinicSlug: "harbour-multi",
      serviceCategories: ["DENTAL", "COSMETIC_AESTHETIC"],
      templates: [
        cosmeticProduction,
        dentalProduction,
        dentalSample,
        dentalDraft,
      ],
    });
    expect(listed.map((template) => template.id).sort()).toEqual([
      "tpl_cosmetic",
      "tpl_dental",
    ]);
  });
});
