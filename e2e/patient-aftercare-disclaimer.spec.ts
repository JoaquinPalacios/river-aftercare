import { expect, test } from "@playwright/test";

import {
  PATIENT_AFTERCARE_DISCLAIMER_CONTACT_FOLLOW_UP,
  PATIENT_AFTERCARE_DISCLAIMER_HEADING,
  patientAftercareDisclaimerBody,
} from "@/lib/aftercare/patient-aftercare-disclaimer";
import { expectNoSeriousAxeViolations } from "./helpers/axe";
import { HARBOR } from "./fixtures/harbor";
import {
  DEMO_TENANT_SLUG,
  HARBOR_TENANT_SLUG,
  tenantUrl,
} from "./helpers/origins";

const DEMO_GUIDE = tenantUrl(DEMO_TENANT_SLUG, "/extraction");
const DEMO_PRINT = tenantUrl(DEMO_TENANT_SLUG, "/extraction/print");
const HARBOR_HOME = tenantUrl(HARBOR_TENANT_SLUG, "/");
const HARBOR_GUIDE = tenantUrl(HARBOR_TENANT_SLUG, "/extraction");
const HARBOR_PRINT = tenantUrl(HARBOR_TENANT_SLUG, "/extraction/print");

const HARBOR_DISCLAIMER = patientAftercareDisclaimerBody(HARBOR.displayName, {
  includeContactFollowUp: true,
});

test.describe("patient aftercare disclaimer", () => {
  test("real-clinic published guide shows the platform disclaimer before contact", async ({
    page,
  }) => {
    await page.goto(HARBOR_GUIDE, { waitUntil: "load" });

    const disclaimer = page.getByRole("heading", {
      name: PATIENT_AFTERCARE_DISCLAIMER_HEADING,
      exact: true,
    });
    await expect(disclaimer).toBeVisible();
    await expect(page.getByText(HARBOR_DISCLAIMER)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: `Contact ${HARBOR.displayName}` })
    ).toBeVisible();

    const disclaimerBox = await disclaimer.boundingBox();
    const contactBox = await page
      .getByRole("heading", { name: `Contact ${HARBOR.displayName}` })
      .boundingBox();
    expect(disclaimerBox, "disclaimer heading").not.toBeNull();
    expect(contactBox, "contact heading").not.toBeNull();
    expect(disclaimerBox!.y).toBeLessThan(contactBox!.y);

    const html = await page.content();
    expect(html).not.toContain("reviewedBy");
    expect(html).not.toContain("reviewAttestedBy");
    expect(html).not.toContain("MedicalWebPage");
    expect(html).not.toContain("Interactive demo");
    expect(html).not.toContain("Sample content only");
    await expectNoSeriousAxeViolations(page);
  });

  test("real-clinic tenant home does not show the published-guide disclaimer", async ({
    page,
  }) => {
    await page.goto(HARBOR_HOME, { waitUntil: "load" });
    await expect(
      page.getByRole("heading", {
        name: PATIENT_AFTERCARE_DISCLAIMER_HEADING,
        exact: true,
      })
    ).toHaveCount(0);
    await expect(
      page.getByText("This aftercare information is provided by")
    ).toHaveCount(0);
  });

  test("real-clinic print includes the same disclaimer before contact", async ({
    page,
  }) => {
    await page.goto(HARBOR_PRINT, { waitUntil: "load" });
    await expect(
      page.getByRole("heading", {
        name: PATIENT_AFTERCARE_DISCLAIMER_HEADING,
        exact: true,
      })
    ).toBeVisible();
    await expect(page.getByText(HARBOR_DISCLAIMER)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: `Contact ${HARBOR.displayName}` })
    ).toBeVisible();
    await expect(page.getByText("SAMPLE / NOT CLINICAL ADVICE")).toHaveCount(0);
    await expect(
      page.getByText(PATIENT_AFTERCARE_DISCLAIMER_CONTACT_FOLLOW_UP)
    ).toBeVisible();

    const html = await page.content();
    expect(html).not.toContain("reviewedBy");
    expect(html).not.toContain("MedicalWebPage");
  });

  test("demodental keeps sample messaging and does not receive the real-clinic disclaimer", async ({
    page,
  }) => {
    await page.goto(DEMO_GUIDE, { waitUntil: "load" });
    await expect(page.getByText("Interactive demo")).toBeVisible();
    await expect(page.getByText("Sample content only")).toBeVisible();
    await expect(page.getByText("Not clinical advice")).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: PATIENT_AFTERCARE_DISCLAIMER_HEADING,
        exact: true,
      })
    ).toHaveCount(0);
    await expect(
      page.getByText("This aftercare information is provided by")
    ).toHaveCount(0);

    await page.goto(DEMO_PRINT, { waitUntil: "load" });
    await expect(page.getByText("SAMPLE / NOT CLINICAL ADVICE")).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: PATIENT_AFTERCARE_DISCLAIMER_HEADING,
        exact: true,
      })
    ).toHaveCount(0);
    await expect(
      page.getByText("This aftercare information is provided by")
    ).toHaveCount(0);
  });
});
