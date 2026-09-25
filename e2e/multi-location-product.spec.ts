import { randomBytes, scryptSync } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousAxeViolations } from "./helpers/axe";
import { expectGenericNotFound } from "./helpers/assertions";
import { e2ePrisma } from "./helpers/prisma";
import { staffUrl, tenantUrl } from "./helpers/origins";

const PREFIX = "e2eml_";
const PASSWORD = "LocalOnly123!";

function passwordHash(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto(staffUrl("/login"), { waitUntil: "load" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(staffUrl("/dashboard"));
}

async function cleanup(): Promise<void> {
  await e2ePrisma.clinic.deleteMany({
    where: { id: { startsWith: PREFIX } },
  });
  await e2ePrisma.user.deleteMany({
    where: { id: { startsWith: PREFIX } },
  });
}

async function seedPractice(): Promise<{
  email: string;
  siteId: string;
  guideId: string;
  siteSlug: string;
}> {
  const key = "practice";
  const clinicId = `${PREFIX}${key}`;
  const userId = `${PREFIX}user_${key}`;
  const email = `${userId}@example.test`;
  const siteSlug = "e2eml-practice";
  await e2ePrisma.user.create({
    data: {
      id: userId,
      email,
      name: "Practice Admin",
      passwordHash: passwordHash(PASSWORD),
    },
  });
  await e2ePrisma.clinic.create({
    data: {
      id: clinicId,
      name: "Practice Account",
      slug: "e2eml-practice-account",
      profile: { create: { displayName: "Legacy Practice" } },
      memberships: { create: { userId, role: "ADMIN" } },
      entitlement: {
        create: {
          commercialPlan: "PRACTICE",
          billingInterval: "MONTHLY",
          billingStatus: "ACTIVE",
          entitlementStatus: "ACTIVE",
          siteAllowance: 1,
          locationAllowance: 2,
        },
      },
    },
  });
  const site = await e2ePrisma.clinicSite.create({
    data: {
      id: `${PREFIX}site_${key}`,
      clinicId,
      name: "Practice Dental",
      slug: siteSlug,
      displayName: "Practice Dental",
      active: true,
      isPrimary: true,
      primaryColor: "#0f766e",
    },
  });
  const location = await e2ePrisma.clinicLocation.create({
    data: {
      id: `${PREFIX}loc_${key}`,
      clinicSiteId: site.id,
      clinicId,
      name: "Burleigh Heads",
      slug: null,
      displayName: "Burleigh Heads",
      phone: "0755550001",
      emergencyInstructions: "Burleigh emergency.",
      isPrimary: true,
      servesSiteRoot: true,
      active: true,
    },
  });
  const guide = await e2ePrisma.practiceGuide.create({
    data: {
      id: `${PREFIX}guide_${key}`,
      clinicId,
      title: "Extraction",
      publicSlug: "extraction",
      status: "PUBLISHED",
      isEnabled: true,
      publishedAt: new Date(),
      sortOrder: 1,
    },
  });
  const revision = await e2ePrisma.practiceGuideRevision.create({
    data: {
      id: `${PREFIX}rev_${key}`,
      practiceGuideId: guide.id,
      version: 1,
      status: "PUBLISHED",
      title: "Extraction",
      publishedAt: new Date(),
      createdByUserId: userId,
      sections: {
        create: {
          key: "introduction",
          kind: "INTRODUCTION",
          title: "About",
          body: "Practice extraction guidance.",
          sortOrder: 1,
          provenance: "PRACTICE_CUSTOM",
        },
      },
    },
  });
  await e2ePrisma.practiceGuideRevision.create({
    data: {
      practiceGuideId: guide.id,
      version: 0,
      status: "DRAFT",
      title: "Extraction",
      createdByUserId: userId,
      sections: {
        create: {
          key: "introduction",
          kind: "INTRODUCTION",
          title: "About",
          body: "Practice extraction guidance.",
          sortOrder: 1,
          provenance: "PRACTICE_CUSTOM",
        },
      },
    },
  });
  await e2ePrisma.practiceGuidePlacement.create({
    data: {
      clinicId,
      locationId: location.id,
      practiceGuideId: guide.id,
      publicSlug: "extraction",
      isEnabled: true,
      publishedPracticeGuideRevisionId: revision.id,
    },
  });
  return { email, siteId: site.id, guideId: guide.id, siteSlug };
}

async function seedGroup(): Promise<{ email: string }> {
  const key = "group";
  const clinicId = `${PREFIX}${key}`;
  const userId = `${PREFIX}user_${key}`;
  const email = `${userId}@example.test`;
  await e2ePrisma.user.create({
    data: {
      id: userId,
      email,
      name: "Group Admin",
      passwordHash: passwordHash(PASSWORD),
    },
  });
  await e2ePrisma.clinic.create({
    data: {
      id: clinicId,
      name: "Pacific Health Group",
      slug: "e2eml-group-account",
      profile: { create: { displayName: "Legacy Group" } },
      memberships: { create: { userId, role: "ADMIN" } },
      entitlement: {
        create: {
          commercialPlan: "GROUP",
          billingInterval: "MONTHLY",
          billingStatus: "ACTIVE",
          entitlementStatus: "ACTIVE",
          siteAllowance: 2,
          locationAllowance: 5,
        },
      },
    },
  });
  const pacific = await e2ePrisma.clinicSite.create({
    data: {
      id: `${PREFIX}site_pacific`,
      clinicId,
      name: "Pacific Dental",
      slug: "e2eml-pacific",
      displayName: "Pacific Dental",
      active: true,
      isPrimary: true,
      primaryColor: "#1d4ed8",
    },
  });
  const coast = await e2ePrisma.clinicSite.create({
    data: {
      id: `${PREFIX}site_coast`,
      clinicId,
      name: "Coast Dental",
      slug: "e2eml-coast",
      displayName: "Coast Dental",
      active: true,
      isPrimary: false,
      primaryColor: "#166534",
    },
  });
  const burleigh = await e2ePrisma.clinicLocation.create({
    data: {
      clinicSiteId: pacific.id,
      clinicId,
      name: "Burleigh Heads",
      slug: null,
      displayName: "Burleigh Heads",
      phone: "0755550001",
      emergencyInstructions: "Burleigh emergency.",
      isPrimary: true,
      servesSiteRoot: true,
      active: true,
    },
  });
  const robina = await e2ePrisma.clinicLocation.create({
    data: {
      clinicSiteId: pacific.id,
      clinicId,
      name: "Robina",
      slug: "robina",
      displayName: "Robina",
      phone: "0755550108",
      emergencyInstructions: "Robina emergency.",
      servesSiteRoot: false,
      active: true,
    },
  });
  const kingscliff = await e2ePrisma.clinicLocation.create({
    data: {
      clinicSiteId: coast.id,
      clinicId,
      name: "Kingscliff",
      slug: null,
      displayName: "Kingscliff",
      phone: "0755550202",
      emergencyInstructions: "Kingscliff emergency.",
      isPrimary: true,
      servesSiteRoot: true,
      active: true,
    },
  });
  const guide = await e2ePrisma.practiceGuide.create({
    data: {
      clinicId,
      title: "Extraction",
      publicSlug: "extraction",
      status: "PUBLISHED",
      isEnabled: true,
      publishedAt: new Date(),
      sortOrder: 1,
    },
  });
  const revision = await e2ePrisma.practiceGuideRevision.create({
    data: {
      practiceGuideId: guide.id,
      version: 1,
      status: "PUBLISHED",
      title: "Extraction",
      publishedAt: new Date(),
      createdByUserId: userId,
      sections: {
        create: {
          key: "introduction",
          kind: "INTRODUCTION",
          title: "About",
          body: "Shared extraction guidance.",
          sortOrder: 1,
          provenance: "PRACTICE_CUSTOM",
        },
      },
    },
  });
  for (const locationId of [burleigh.id, robina.id, kingscliff.id]) {
    await e2ePrisma.practiceGuidePlacement.create({
      data: {
        clinicId,
        locationId,
        practiceGuideId: guide.id,
        publicSlug: "extraction",
        isEnabled: true,
        publishedPracticeGuideRevisionId: revision.id,
      },
    });
  }
  return { email };
}

test.describe.configure({ mode: "serial" });

test.describe("multi-location product", () => {
  test.beforeAll(async () => {
    await cleanup();
  });

  test.afterAll(async () => {
    await cleanup();
    await e2ePrisma.$disconnect();
  });

  test("practice admin adds, edits, shares, and deactivates a location", async ({
    page,
  }) => {
    const seeded = await seedPractice();
    await signIn(page, seeded.email);
    await page.goto(staffUrl("/practice/sites"), { waitUntil: "load" });
    await expect(
      page.getByRole("heading", { name: "Sites & Locations" })
    ).toBeVisible();
    await expect(page.getByLabel("Capacity")).toContainText("1 / 1");
    await expect(page.getByLabel("Capacity")).toContainText("1 / 2");
    await expectNoSeriousAxeViolations(page);

    await page.getByRole("link", { name: "Manage site" }).click();
    await page.locator("#new-location-name").fill("Robina");
    await page.locator("#new-location-display").fill("Robina");
    await expect(page.locator("#new-location-slug")).toHaveValue("robina");
    await page.getByRole("button", { name: "Add location" }).click();
    await expect(
      page.getByText("e2eml-practice.localhost/robina")
    ).toBeVisible();

    const robina = page.getByRole("listitem").filter({
      hasText: "e2eml-practice.localhost/robina",
    });
    await robina.getByLabel("Phone").fill("0755550199");
    await robina.getByRole("button", { name: "Save location" }).click();
    await expect(robina.getByText("Location saved.")).toBeVisible();

    await page.goto(staffUrl(`/guides/${seeded.guideId}/edit`), {
      waitUntil: "load",
    });
    await page
      .getByRole("checkbox", { name: "Make available at Robina" })
      .click();
    const patientLink = page.getByRole("link", {
      name: "Open patient page for Robina",
    });
    await expect(patientLink).toBeVisible();
    await expect(patientLink).toHaveAttribute(
      "href",
      tenantUrl(seeded.siteSlug, "/robina/extraction")
    );

    await page.goto(tenantUrl(seeded.siteSlug, "/robina"), {
      waitUntil: "load",
    });
    await expect(
      page.getByRole("heading", { name: "Practice Dental", exact: true })
    ).toBeVisible();
    await expect(page.getByText("Robina", { exact: true })).toBeVisible();
    await page.goto(tenantUrl(seeded.siteSlug, "/robina/extraction"), {
      waitUntil: "load",
    });
    await expect(page.getByText("Practice extraction guidance.")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Call Practice Dental" })
    ).toHaveAttribute("href", "tel:0755550199");
    await page.goto(tenantUrl(seeded.siteSlug, "/robina/extraction/print"), {
      waitUntil: "load",
    });
    await expect(page.getByText("Practice extraction guidance.")).toBeVisible();

    await page.goto(staffUrl(`/practice/sites/${seeded.siteId}`), {
      waitUntil: "load",
    });
    const robinaAgain = page.getByRole("listitem").filter({
      hasText: "e2eml-practice.localhost/robina",
    });
    await robinaAgain
      .getByRole("button", { name: "Deactivate location" })
      .click();
    await page.getByRole("button", { name: "Deactivate", exact: true }).click();
    await expect(robinaAgain.getByText("Inactive")).toBeVisible();
    await page.goto(tenantUrl(seeded.siteSlug, "/robina/extraction"), {
      waitUntil: "load",
    });
    await expectGenericNotFound(page);
    await page.goto(tenantUrl(seeded.siteSlug, "/extraction"), {
      waitUntil: "load",
    });
    await expect(page.getByText("Practice extraction guidance.")).toBeVisible();
  });

  test("group patients see the site brand and the location contact", async ({
    page,
  }) => {
    const seeded = await seedGroup();
    await signIn(page, seeded.email);
    await page.goto(staffUrl("/practice/sites"), { waitUntil: "load" });
    await expect(
      page.getByRole("heading", { name: "Pacific Dental" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Coast Dental" })
    ).toBeVisible();
    await expect(page.getByLabel("Capacity")).toContainText("2 / 2");
    await expect(page.getByLabel("Capacity")).toContainText("3 / 5");
    await expect(page.getByText("Pacific Health Group")).toHaveCount(0);

    await page.goto(tenantUrl("e2eml-pacific", "/extraction"), {
      waitUntil: "load",
    });
    await expect(page.getByText("Pacific Dental").first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Call Pacific Dental" })
    ).toHaveAttribute("href", "tel:0755550001");
    await expect(page.getByText("Burleigh emergency.")).toBeVisible();
    await expect(page.getByText("Pacific Health Group")).toHaveCount(0);

    await page.goto(tenantUrl("e2eml-pacific", "/robina/extraction"), {
      waitUntil: "load",
    });
    await expect(page.getByText("Pacific Dental").first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Call Pacific Dental" })
    ).toHaveAttribute("href", "tel:0755550108");
    await expect(page.getByText("Robina emergency.")).toBeVisible();
    await expect(page.getByText("Shared extraction guidance.")).toBeVisible();

    await page.goto(tenantUrl("e2eml-coast", "/extraction"), {
      waitUntil: "load",
    });
    await expect(page.getByText("Coast Dental").first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Call Coast Dental" })
    ).toHaveAttribute("href", "tel:0755550202");
    await expect(page.getByText("Kingscliff emergency.")).toBeVisible();
    await expect(page.getByText("Pacific Dental")).toHaveCount(0);
  });
});
