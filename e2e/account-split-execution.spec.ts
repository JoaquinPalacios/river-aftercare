import { expect, test } from "@playwright/test";

import { e2ePrisma } from "./helpers/prisma";
import { staffUrl, tenantUrl } from "./helpers/origins";
import { signInAsLocalOperator } from "./helpers/staff-auth";

const CLINIC_ID = "e2eex_group";
const DESTINATION_ID = "e2eex_dest";
const ADMIN_ID = "e2eex_admin";
const STAFF_ID = "e2eex_staff";
const KEPT_ID = "e2eex_harbour";
const MOVE_ID = "e2eex_coast";
const MOVE_SLUG = "e2eex-coast";
const GUIDE_BODY = "E2E rinse instructions stay visible";

async function cleanup(): Promise<void> {
  await e2ePrisma.clinicAccountSplitPreparation.deleteMany({
    where: { sourceClinicId: CLINIC_ID },
  });
  await e2ePrisma.clinic.deleteMany({
    where: { id: { in: [CLINIC_ID, DESTINATION_ID] } },
  });
  await e2ePrisma.user.deleteMany({
    where: { id: { in: [ADMIN_ID, STAFF_ID] } },
  });
}

async function seedPreparedSplit(): Promise<void> {
  await e2ePrisma.user.createMany({
    data: [
      {
        id: ADMIN_ID,
        email: "e2eex-admin@example.test",
        name: "Ada Admin",
      },
      {
        id: STAFF_ID,
        email: "e2eex-staff@example.test",
        name: "Sam Staff",
      },
    ],
  });
  await e2ePrisma.clinic.create({
    data: {
      id: CLINIC_ID,
      name: "Execution Smoke Group",
      slug: "e2eex-account",
      profile: { create: { displayName: "Execution Smoke Group" } },
      memberships: {
        create: [
          { userId: ADMIN_ID, role: "ADMIN" },
          { userId: STAFF_ID, role: "STAFF" },
        ],
      },
      entitlement: {
        create: {
          commercialPlan: "GROUP",
          billingInterval: "MONTHLY",
          billingStatus: "ACTIVE",
          entitlementStatus: "ACTIVE",
          siteAllowance: 4,
          locationAllowance: 5,
        },
      },
    },
  });
  await e2ePrisma.clinic.create({
    data: {
      id: DESTINATION_ID,
      name: "Coast Dental",
      slug: "e2eex-shell",
      profile: { create: { displayName: "Coast Dental" } },
      entitlement: {
        create: {
          commercialPlan: "PRACTICE",
          billingInterval: "MONTHLY",
          billingStatus: "ACTIVE",
          entitlementStatus: "ACTIVE",
          siteAllowance: 1,
          locationAllowance: 1,
          cancelAtPeriodEnd: false,
        },
      },
    },
  });
  const sites = [
    {
      id: KEPT_ID,
      name: "Harbour",
      slug: "e2eex-harbour",
      displayName: "Harbour Dental",
      isPrimary: true,
    },
    {
      id: MOVE_ID,
      name: "Coast",
      slug: MOVE_SLUG,
      displayName: "Coast Dental",
      isPrimary: false,
    },
  ];
  for (const site of sites) {
    await e2ePrisma.clinicSite.create({
      data: { ...site, clinicId: CLINIC_ID, active: true },
    });
    await e2ePrisma.clinicLocation.create({
      data: {
        id: `${site.id}_root`,
        clinicSiteId: site.id,
        clinicId: CLINIC_ID,
        name: `${site.displayName} root`,
        slug: null,
        displayName: `${site.displayName} root`,
        isPrimary: true,
        servesSiteRoot: true,
        active: true,
      },
    });
  }
  await e2ePrisma.practiceGuide.create({
    data: {
      id: "e2eex_guide",
      clinicId: CLINIC_ID,
      title: "Extraction",
      publicSlug: "extraction",
      status: "PUBLISHED",
      isEnabled: true,
      publishedAt: new Date("2026-09-01T00:00:00.000Z"),
      contentRevisions: {
        create: {
          id: "e2eex_rev",
          version: 1,
          status: "PUBLISHED",
          title: "Extraction",
          publishedAt: new Date("2026-09-01T00:00:00.000Z"),
          sections: {
            create: {
              key: "care",
              kind: "SITE_CARE",
              title: "Care",
              body: GUIDE_BODY,
              sortOrder: 0,
              provenance: "PRACTICE_CUSTOM",
            },
          },
        },
      },
    },
  });
  await e2ePrisma.practiceGuidePlacement.create({
    data: {
      id: "e2eex_place",
      clinicId: CLINIC_ID,
      locationId: `${MOVE_ID}_root`,
      practiceGuideId: "e2eex_guide",
      publishedPracticeGuideRevisionId: "e2eex_rev",
      publicSlug: "extraction",
      isEnabled: true,
    },
  });
  await e2ePrisma.clinicAccountSplitPreparation.create({
    data: {
      id: "e2eex_prep",
      sourceClinicId: CLINIC_ID,
      destinationClinicId: DESTINATION_ID,
      keptClinicSiteId: KEPT_ID,
      status: "READY_TO_EXECUTE",
      destinationPlan: "PRACTICE",
      destinationBillingInterval: "MONTHLY",
      targetSourcePlan: "PRACTICE",
      preparedByUserId: "user_demo_operator",
      expectedConfirmation: `split ${MOVE_SLUG}`,
      siteDecisions: {
        create: { clinicSiteId: MOVE_ID, decision: "SPLIT" },
      },
      staffSelections: {
        create: [
          {
            userId: ADMIN_ID,
            keepOnSource: false,
            grantOnDestination: true,
            destinationRole: "ADMIN",
          },
          {
            userId: STAFF_ID,
            keepOnSource: true,
            grantOnDestination: false,
            destinationRole: "STAFF",
          },
        ],
      },
    },
  });
}

test.describe("account split execution", () => {
  test.beforeEach(async () => {
    await cleanup();
    await seedPreparedSplit();
  });

  test.afterEach(async () => {
    await cleanup();
  });

  test("operator executes a prepared split and the public url stays", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto(tenantUrl(MOVE_SLUG, "/extraction"), { waitUntil: "load" });
    await expect(page.getByText(GUIDE_BODY)).toBeVisible();

    await signInAsLocalOperator(page);
    await page.goto(staffUrl(`/operator/clinics/${CLINIC_ID}/split`), {
      waitUntil: "load",
    });
    await expect(page.getByText("Split execution: READY")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Execute this split" })
    ).toBeVisible();
    await expect(page.getByText("Move Coast Dental")).toBeVisible();
    await expect(page.getByText("Preserve public URLs")).toBeVisible();
    await expect(
      page.getByText("Downgrade the source Group subscription")
    ).toBeVisible();
    await expect(page.getByText("Change patient URLs")).toBeVisible();

    await page
      .getByLabel(`Type split ${MOVE_SLUG} to execute`)
      .fill(`split ${MOVE_SLUG}`);
    await page.getByRole("button", { name: "Execute split" }).click();

    await expect(
      page.getByRole("heading", { name: "Completed split" })
    ).toBeVisible();
    await expect(
      page.getByText(
        "This preparation has been executed. It cannot be executed again."
      )
    ).toBeVisible();
    const completed = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Completed split" }) });
    await expect(completed.getByText("Moved Site").locator("..")).toContainText(
      "Coast Dental · e2eex-coast"
    );
    await expect(
      completed.getByText("Destination Account").locator("..")
    ).toContainText("e2eex-coast");
    await expect(page.getByText("Group to Practice downgrade")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Execute split" })
    ).toHaveCount(0);

    const source = await e2ePrisma.clinic.findUnique({
      where: { id: CLINIC_ID },
    });
    const moved = await e2ePrisma.clinicSite.findUnique({
      where: { id: MOVE_ID },
    });
    expect(source?.id).toBe(CLINIC_ID);
    expect(moved).toMatchObject({
      id: MOVE_ID,
      clinicId: DESTINATION_ID,
      slug: MOVE_SLUG,
      isPrimary: true,
    });

    await page.goto(tenantUrl(MOVE_SLUG, "/extraction"), { waitUntil: "load" });
    await expect(page.getByText(GUIDE_BODY)).toBeVisible();
    await expect(page).toHaveURL(tenantUrl(MOVE_SLUG, "/extraction"));

    await page.goto(staffUrl(`/operator/clinics/${CLINIC_ID}/split`), {
      waitUntil: "load",
    });
    await expect(
      page.getByRole("heading", { name: "Completed split" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Execute split" })
    ).toHaveCount(0);
  });
});
