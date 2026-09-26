import { expect, test } from "@playwright/test";

import { e2ePrisma } from "./helpers/prisma";
import { staffUrl } from "./helpers/origins";
import { signInAsLocalOperator } from "./helpers/staff-auth";

const CLINIC_ID = "e2espl_group";
const ADMIN_ID = "e2espl_admin";
const STAFF_ID = "e2espl_staff";

async function cleanup(): Promise<void> {
  const preparations = await e2ePrisma.clinicAccountSplitPreparation.findMany({
    where: { sourceClinicId: CLINIC_ID },
    select: { destinationClinicId: true },
  });
  const destinationIds = preparations.flatMap((row) =>
    row.destinationClinicId ? [row.destinationClinicId] : []
  );
  await e2ePrisma.clinic.deleteMany({ where: { id: CLINIC_ID } });
  if (destinationIds.length > 0) {
    await e2ePrisma.clinic.deleteMany({
      where: { id: { in: destinationIds } },
    });
  }
  await e2ePrisma.user.deleteMany({
    where: { id: { in: [ADMIN_ID, STAFF_ID] } },
  });
}

async function seedGroup(): Promise<void> {
  await e2ePrisma.user.createMany({
    data: [
      {
        id: ADMIN_ID,
        email: "e2espl-admin@example.test",
        name: "Ada Admin",
      },
      {
        id: STAFF_ID,
        email: "e2espl-staff@example.test",
        name: "Sam Staff",
      },
    ],
  });
  await e2ePrisma.clinic.create({
    data: {
      id: CLINIC_ID,
      name: "Split Smoke Group",
      slug: "e2espl-account",
      profile: { create: { displayName: "Split Smoke Group" } },
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
  const sites = [
    {
      id: "e2espl_harbour",
      name: "Harbour",
      slug: "e2espl-harbour",
      displayName: "Harbour Dental",
      isPrimary: false,
    },
    {
      id: "e2espl_coast",
      name: "Coast",
      slug: "e2espl-coast",
      displayName: "Coast Dental",
      isPrimary: false,
    },
    {
      id: "e2espl_north",
      name: "North",
      slug: "e2espl-north",
      displayName: "Northern Dental",
      isPrimary: false,
    },
    {
      id: "e2espl_pacific",
      name: "Pacific",
      slug: "e2espl-pacific",
      displayName: "Pacific Dental",
      isPrimary: true,
    },
  ];
  for (const site of sites) {
    await e2ePrisma.clinicSite.create({
      data: {
        ...site,
        clinicId: CLINIC_ID,
        active: true,
      },
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
}

test.describe("account split preparation", () => {
  test.beforeEach(async () => {
    await cleanup();
    await seedGroup();
  });

  test.afterEach(async () => {
    await cleanup();
  });

  test("operator prepares a retained site without executing the split", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await signInAsLocalOperator(page);
    await page.goto(staffUrl(`/operator/clinics/${CLINIC_ID}/split`), {
      waitUntil: "load",
    });
    await expect(
      page.getByRole("heading", {
        name: "Account split / downgrade preparation",
      })
    ).toBeVisible();

    await page
      .getByLabel("Site that stays on the source Account")
      .selectOption({ label: "Harbour Dental · e2espl-harbour" });
    await page.getByRole("button", { name: "Start preparation" }).click();
    await expect(page.getByRole("heading", { name: "Sites" })).toBeVisible();

    const coast = page.getByRole("group", { name: /Coast Dental/ });
    const north = page.getByRole("group", { name: /Northern Dental/ });
    const pacific = page.getByRole("group", { name: /Pacific Dental/ });
    await coast
      .getByRole("radio", { name: "Split to the new Account" })
      .check();
    await north
      .getByRole("radio", { name: "Keep active on the source Account" })
      .check();
    await pacific.getByRole("radio", { name: "Deactivate" }).check();
    await page.getByRole("button", { name: "Save site decisions" }).click();

    const createShell = page.getByRole("button", {
      name: "Create destination shell",
    });
    await expect(createShell).toBeEnabled();
    await createShell.click();
    const destinationLink = page.getByRole("link", {
      name: "Open destination account",
    });
    await expect(destinationLink).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Invite destination admin" })
    ).toBeVisible();
    await expect(page.getByText("Coast Dental").first()).toBeVisible();
    await expect(page.getByText("Target plan:")).toBeVisible();

    const ada = page.getByRole("group", { name: "Ada Admin" });
    await ada.getByRole("radio", { name: "Destination only" }).check();
    await ada.getByLabel("Destination role").selectOption("ADMIN");
    await page
      .getByRole("group", { name: "Sam Staff" })
      .getByRole("radio", { name: "Source only" })
      .check();
    await page.getByRole("button", { name: "Save staff decisions" }).click();
    await expect(page.getByText("Split execution:")).toBeVisible();

    const href = await destinationLink.getAttribute("href");
    const destinationId = href?.split("/").filter(Boolean).at(-1);
    expect(destinationId).toBeTruthy();
    await e2ePrisma.clinicEntitlement.upsert({
      where: { clinicId: destinationId! },
      create: {
        clinicId: destinationId!,
        commercialPlan: "PRACTICE",
        billingInterval: "MONTHLY",
        billingStatus: "ACTIVE",
        entitlementStatus: "ACTIVE",
        siteAllowance: 1,
        locationAllowance: 1,
        cancelAtPeriodEnd: false,
      },
      update: {
        commercialPlan: "PRACTICE",
        billingInterval: "MONTHLY",
        billingStatus: "ACTIVE",
        entitlementStatus: "ACTIVE",
        siteAllowance: 1,
        locationAllowance: 1,
        cancelAtPeriodEnd: false,
        scheduledCommercialPlan: null,
      },
    });
    await page.reload({ waitUntil: "load" });

    await expect(page.getByText("Plan remains: GROUP")).toBeVisible();
    await expect(page.getByText("Active sites: 2")).toBeVisible();
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: "Harbour Dental · e2espl-harbour" })
    ).toBeVisible();
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: "Northern Dental · e2espl-north" })
    ).toBeVisible();
    await expect(page.getByText("Split execution: READY")).toBeVisible();
    await expect(
      page.getByText("Group to Practice downgrade: NOT READY")
    ).toBeVisible();
    await expect(
      page.getByText(
        "Source Account will remain Group because 1 additional active Clinic Site is retained for a later split."
      )
    ).toBeVisible();
    await expect(
      page.getByText(
        "Harbour Dental will become the source Account primary Clinic Site during execution."
      )
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Execute this split" })
    ).toBeVisible();
    await expect(page.getByText("Move Coast Dental")).toBeVisible();
    await expect(page.getByText("Preserve public URLs")).toBeVisible();
    await expect(
      page.getByText("Downgrade the source Group subscription")
    ).toBeVisible();
    await expect(page.getByText("Change patient URLs")).toBeVisible();
    await expect(
      page.getByLabel("Type split e2espl-coast to execute")
    ).toHaveValue("");
    await page.getByRole("button", { name: "Execute split" }).click();
    await expect(
      page.getByRole("heading", { name: "Completed split" })
    ).toHaveCount(0);

    expect(
      await e2ePrisma.clinicSite.count({ where: { clinicId: destinationId! } })
    ).toBe(0);
    const pacificSite = await e2ePrisma.clinicSite.findUniqueOrThrow({
      where: { id: "e2espl_pacific" },
    });
    expect(pacificSite.isPrimary).toBe(true);
    expect(pacificSite.active).toBe(true);
    expect(pacificSite.clinicId).toBe(CLINIC_ID);

    await page.getByRole("button", { name: "Cancel preparation" }).click();
    await expect(page.getByRole("heading", { name: "Start" })).toBeVisible();
    await expect(page.getByText(/was not deleted/)).toBeVisible();
    expect(
      await e2ePrisma.clinicSite.count({ where: { clinicId: destinationId! } })
    ).toBe(0);
  });
});
