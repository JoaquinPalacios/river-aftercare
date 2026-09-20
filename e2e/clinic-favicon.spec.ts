import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { clinicLogoObjectKey } from "@/lib/clinic-assets/clinic-logo";
import { createFilesystemClinicAssetStorage } from "@/lib/clinic-assets/filesystem-clinic-asset-storage";
import { HARBOR } from "./fixtures/harbor";
import { solidPng } from "../tests/helpers/solid-png";
import {
  chromiumTargetFaviconUrl,
  clinicBrandingHrefs,
  headDump,
  iconHref,
  iconHrefs,
  iconLinkTags,
  isFileConventionIconHref,
  isRiverPackHref,
  pathnameOf,
} from "./helpers/head-icons";
import { e2ePrisma } from "./helpers/prisma";
import {
  DEMO_TENANT_SLUG,
  HARBOR_TENANT_SLUG,
  marketingUrl,
  staffUrl,
  tenantUrl,
} from "./helpers/origins";
import {
  acquireDemoBrandingLock,
  releaseDemoBrandingLock,
} from "./helpers/demo-branding-lock";
import {
  signInAsLocalAdmin,
  signInAsLocalOperator,
} from "./helpers/staff-auth";

const DEMO_CLINIC_ID = "clinic_demo_rivers";
const ARTIFACT_DIR = "docs/product/artifacts/clinic-branding";
const FAVICON_A = solidPng(32, 32, [15, 118, 110]);
const FAVICON_B = solidPng(64, 64, [124, 58, 237]);
const LOGO_PNG = solidPng(48, 24, [15, 118, 110]);
const DARK_LOGO_PNG = solidPng(48, 24, [34, 211, 238]);

const ORIGINAL = {
  primaryColor: "#0f766e",
  accentColor: "#f59e0b",
  darkPrimaryColor: null as string | null,
  darkAccentColor: null as string | null,
  useCustomDarkBranding: false,
  darkLogoUrl: null as string | null,
  faviconUrl: null as string | null,
  logoUrl: "/demo/riverside-mark.svg",
};

function writeArtifact(
  name: string,
  contents: string,
  browserName?: string
): void {
  const file =
    browserName === "webkit" ? name.replace(/(\.[^.]+)$/, "-webkit$1") : name;
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  mkdirSync("test-results/artifacts", { recursive: true });
  writeFileSync(`${ARTIFACT_DIR}/${file}`, contents);
  writeFileSync(`test-results/artifacts/${file}`, contents);
}

function publicBrandingPath(storageKey: string): string {
  const filename = storageKey.split("/").pop();
  const clinicId = storageKey.split("/")[1];
  return `/clinic-branding/${clinicId}/${filename}`;
}

function assertRiverPack(html: string): void {
  const hrefs = iconHrefs(html);
  expect(hrefs.some((href) => isRiverPackHref(href))).toBe(true);
  expect(hrefs.some((href) => isFileConventionIconHref(href))).toBe(false);
  expect(clinicBrandingHrefs(html)).toEqual([]);
}

function assertClinicFaviconOnly(html: string, faviconPath: string): void {
  const tags = iconLinkTags(html);
  const hrefs = tags.map(iconHref);
  expect(hrefs.some((href) => pathnameOf(href) === faviconPath)).toBe(true);
  expect(
    tags.some(
      (tag) =>
        /apple-touch-icon/i.test(tag) &&
        pathnameOf(iconHref(tag)) === faviconPath
    )
  ).toBe(true);
  expect(hrefs.filter((href) => isRiverPackHref(href))).toEqual([]);
  expect(hrefs.filter((href) => isFileConventionIconHref(href))).toEqual([]);
  expect(
    hrefs.filter((href) => pathnameOf(href).includes("/clinic-branding/"))
  ).toEqual(hrefs.filter((href) => pathnameOf(href) === faviconPath));
}

async function restoreDemoBranding(): Promise<void> {
  await e2ePrisma.clinicProfile.update({
    where: { clinicId: DEMO_CLINIC_ID },
    data: ORIGINAL,
  });
}

const E2E_ASSET_ROOT = path.join(process.cwd(), ".data", "clinic-assets-e2e");

async function seedBrandingAsset(
  field: "faviconUrl" | "logoUrl" | "darkLogoUrl",
  bytes: Buffer
): Promise<string> {
  const storage = createFilesystemClinicAssetStorage({ root: E2E_ASSET_ROOT });
  const storageKey = clinicLogoObjectKey({
    clinicId: DEMO_CLINIC_ID,
    objectId: randomUUID(),
    extension: "png",
  });
  await storage.uploadLogo({
    clinicId: DEMO_CLINIC_ID,
    storageKey,
    bytes: new Uint8Array(bytes),
    mimeType: "image/png",
  });
  const current = await e2ePrisma.clinicProfile.findUnique({
    where: { clinicId: DEMO_CLINIC_ID },
    select: { faviconUrl: true, logoUrl: true, darkLogoUrl: true },
  });
  const previous = current?.[field];
  await e2ePrisma.clinicProfile.update({
    where: { clinicId: DEMO_CLINIC_ID },
    data: { [field]: storageKey },
  });
  if (
    typeof previous === "string" &&
    previous.startsWith(`clinics/${DEMO_CLINIC_ID}/branding/`)
  ) {
    await storage.deleteLogo({
      clinicId: DEMO_CLINIC_ID,
      storageKey: previous,
    });
  }
  return storageKey;
}

async function installFavicon(
  page: Page,
  browserName: string,
  buffer: Buffer,
  buttonName: string
): Promise<void> {
  if (browserName === "webkit") {
    await seedBrandingAsset("faviconUrl", buffer);
    return;
  }
  await signInAsLocalAdmin(page);
  await uploadNamedAsset(
    page,
    "#clinic-favicon-file",
    "favicon.png",
    buffer,
    buttonName,
    "Favicon updated."
  );
}

async function uploadNamedAsset(
  page: Page,
  inputId: string,
  fileName: string,
  buffer: Buffer,
  buttonName: string,
  successText: string
): Promise<void> {
  await page.goto(staffUrl("/practice"), { waitUntil: "load" });
  await page.setInputFiles(inputId, {
    name: fileName,
    mimeType: "image/png",
    buffer,
  });
  await page.getByRole("button", { name: buttonName }).click();
  await expect(page.getByText(successText)).toBeVisible();
}

test.describe("clinic favicon end to end", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    await acquireDemoBrandingLock();
  });

  test.afterEach(async () => {
    await restoreDemoBranding();
  });

  test.afterAll(async () => {
    await restoreDemoBranding();
    await releaseDemoBrandingLock();
    await e2ePrisma.$disconnect();
  });

  test("marketing, staff, login, and operator keep the River favicon pack", async ({
    page,
    browser,
    browserName,
  }) => {
    const marketing = await page.goto(marketingUrl("/"), {
      waitUntil: "load",
    });
    expect(marketing?.status()).toBe(200);
    const marketingHtml = await page.content();
    assertRiverPack(marketingHtml);
    writeArtifact(
      "marketing-river-favicon-head.txt",
      headDump(marketingHtml),
      browserName
    );
    const riverIco = await page.request.get(
      marketingUrl("/favicons/favicon.ico")
    );
    expect(riverIco.status()).toBe(200);
    const rootIco = await page.request.get(marketingUrl("/favicon.ico"));
    expect(rootIco.status()).toBe(404);

    for (const path of ["/pricing", "/about", "/contact"]) {
      await page.goto(marketingUrl(path), { waitUntil: "load" });
      assertRiverPack(await page.content());
    }

    await page.goto(staffUrl("/login"), { waitUntil: "load" });
    const loginHtml = await page.content();
    assertRiverPack(loginHtml);
    writeArtifact(
      "staff-river-favicon-head.txt",
      headDump(loginHtml),
      browserName
    );
    const loginIco = await page.request.get(staffUrl("/favicons/favicon.ico"));
    expect(loginIco.status()).toBe(200);
    const loginRootIco = await page.request.get(staffUrl("/favicon.ico"));
    expect(loginRootIco.status()).toBe(404);

    if (browserName === "webkit") {
      return;
    }

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await signInAsLocalAdmin(adminPage);
    await adminPage.goto(staffUrl("/dashboard"), { waitUntil: "load" });
    assertRiverPack(await adminPage.content());
    await adminContext.close();

    const operatorContext = await browser.newContext();
    const operatorPage = await operatorContext.newPage();
    await signInAsLocalOperator(operatorPage);
    await operatorPage.goto(staffUrl("/operator/clinics"), {
      waitUntil: "load",
    });
    assertRiverPack(await operatorPage.content());
    await operatorContext.close();
  });

  test("patient guide without a clinic favicon uses the River pack", async ({
    page,
  }) => {
    await page.goto(tenantUrl(DEMO_TENANT_SLUG, "/extraction"), {
      waitUntil: "load",
    });
    const html = await page.content();
    assertRiverPack(html);
    const ico = await page.request.get(marketingUrl("/favicons/favicon.ico"));
    expect(ico.status()).toBe(200);
    const rootIco = await page.request.get(
      tenantUrl(DEMO_TENANT_SLUG, "/favicon.ico")
    );
    expect(rootIco.status()).toBe(404);
  });

  test("uploaded clinic favicon is the only rel=icon and returns 200", async ({
    page,
    browserName,
  }) => {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    await installFavicon(page, browserName, FAVICON_A, "Upload favicon");

    const profile = await e2ePrisma.clinicProfile.findUnique({
      where: { clinicId: DEMO_CLINIC_ID },
      select: { faviconUrl: true },
    });
    expect(profile?.faviconUrl).toMatch(
      /^clinics\/clinic_demo_rivers\/branding\/.+\.png$/
    );
    const faviconPath = publicBrandingPath(profile!.faviconUrl!);
    writeArtifact("favicon-a-url.txt", `${faviconPath}\n`, browserName);

    const assetRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (
        url.includes("favicon") ||
        url.includes("/icon") ||
        url.includes("clinic-branding") ||
        url.includes("apple-touch")
      ) {
        assetRequests.push(url);
      }
    });

    const tenant = await page.goto(tenantUrl(DEMO_TENANT_SLUG, "/extraction"), {
      waitUntil: "load",
    });
    expect(tenant?.status()).toBe(200);
    const html = await page.content();
    writeArtifact("tenant-favicon-head.txt", headDump(html), browserName);
    assertClinicFaviconOnly(html, faviconPath);

    const asset = await page.request.get(
      tenantUrl(DEMO_TENANT_SLUG, faviconPath)
    );
    expect(asset.status()).toBe(200);
    expect(asset.headers()["content-type"]).toContain("image/png");
    const bytes = Buffer.from(await asset.body());
    expect(bytes.equals(FAVICON_A)).toBe(true);

    const selected = await chromiumTargetFaviconUrl(page);
    writeArtifact(
      "tenant-favicon-network.txt",
      [
        `browser=${browserName}`,
        `clinicFaviconPath=${faviconPath}`,
        `clinicFaviconStatus=${asset.status()}`,
        `clinicFaviconContentType=${asset.headers()["content-type"]}`,
        `targetInfo.faviconUrl=${selected ?? "(null or unavailable)"}`,
        "pageRequests:",
        ...(assetRequests.length > 0 ? assetRequests : ["(none captured)"]),
        `explicitGET ${tenantUrl(DEMO_TENANT_SLUG, faviconPath)} ${asset.status()}`,
      ].join("\n") + "\n",
      browserName
    );

    if (browserName === "chromium") {
      expect(html).toContain(faviconPath);
      expect(
        iconHrefs(html).some((href) => isFileConventionIconHref(href))
      ).toBe(false);
    }

    await page.screenshot({
      path:
        browserName === "webkit"
          ? `${ARTIFACT_DIR}/tenant-with-clinic-favicon-webkit.png`
          : `${ARTIFACT_DIR}/tenant-with-clinic-favicon.png`,
      fullPage: true,
    });
  });

  test("replacing the favicon writes a new UUID URL that returns 200", async ({
    page,
    browser,
    browserName,
  }) => {
    await installFavicon(page, browserName, FAVICON_A, "Upload favicon");
    const first = await e2ePrisma.clinicProfile.findUnique({
      where: { clinicId: DEMO_CLINIC_ID },
      select: { faviconUrl: true },
    });
    const urlA = publicBrandingPath(first!.faviconUrl!);
    writeArtifact("favicon-a-url.txt", `${urlA}\n`, browserName);

    if (browserName === "webkit") {
      await seedBrandingAsset("faviconUrl", FAVICON_B);
    } else {
      await uploadNamedAsset(
        page,
        "#clinic-favicon-file",
        "favicon-b.png",
        FAVICON_B,
        "Upload replacement",
        "Favicon updated."
      );
    }
    const second = await e2ePrisma.clinicProfile.findUnique({
      where: { clinicId: DEMO_CLINIC_ID },
      select: { faviconUrl: true },
    });
    const urlB = publicBrandingPath(second!.faviconUrl!);
    expect(urlB).not.toBe(urlA);
    writeArtifact("favicon-b-url.txt", `${urlB}\n`, browserName);

    const context = await browser.newContext();
    const fresh = await context.newPage();
    const requested: string[] = [];
    fresh.on("request", (request) => {
      requested.push(request.url());
    });
    await fresh.goto(tenantUrl(DEMO_TENANT_SLUG, "/extraction"), {
      waitUntil: "load",
    });
    const html = await fresh.content();
    assertClinicFaviconOnly(html, urlB);
    expect(html).not.toContain(urlA);

    const responseB = await fresh.request.get(
      tenantUrl(DEMO_TENANT_SLUG, urlB)
    );
    expect(responseB.status()).toBe(200);
    expect(Buffer.from(await responseB.body()).equals(FAVICON_B)).toBe(true);

    const responseA = await fresh.request.get(
      tenantUrl(DEMO_TENANT_SLUG, urlA)
    );
    expect(responseA.status()).toBe(404);

    expect(requested.some((url) => url.includes(pathnameOf(urlA)))).toBe(false);

    if (browserName === "chromium") {
      const selected = await chromiumTargetFaviconUrl(fresh);
      if (selected) {
        expect(selected).not.toContain(urlA);
      }
    }

    await context.close();
  });

  test("removing the favicon restores the River pack", async ({
    page,
    browserName,
  }) => {
    await installFavicon(page, browserName, FAVICON_A, "Upload favicon");
    if (browserName === "webkit") {
      await e2ePrisma.clinicProfile.update({
        where: { clinicId: DEMO_CLINIC_ID },
        data: { faviconUrl: null },
      });
    } else {
      await page.getByRole("button", { name: "Remove favicon" }).click();
      await expect(
        page.getByRole("dialog", { name: "Remove favicon?" })
      ).toBeVisible();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Remove favicon" })
        .click();
      await expect(page.getByText("Favicon removed.")).toBeVisible();
    }

    await page.goto(tenantUrl(DEMO_TENANT_SLUG, "/extraction"), {
      waitUntil: "load",
    });
    const html = await page.content();
    writeArtifact(
      "tenant-after-favicon-removal-head.txt",
      headDump(html),
      browserName
    );
    assertRiverPack(html);
    const ico = await page.request.get(marketingUrl("/favicons/favicon.ico"));
    expect(ico.status()).toBe(200);
    await page.screenshot({
      path:
        browserName === "webkit"
          ? `${ARTIFACT_DIR}/tenant-after-favicon-removal-webkit.png`
          : `${ARTIFACT_DIR}/tenant-after-favicon-removal.png`,
      fullPage: true,
    });
  });

  test("clinic branding GET is tenant-scoped at HTML and bytes", async ({
    page,
    browserName,
  }) => {
    await installFavicon(page, browserName, FAVICON_A, "Upload favicon");
    const profile = await e2ePrisma.clinicProfile.findUnique({
      where: { clinicId: DEMO_CLINIC_ID },
      select: { faviconUrl: true, primaryColor: true },
    });
    const filename = profile!.faviconUrl!.split("/").pop()!;
    const demoPath = `/clinic-branding/${DEMO_CLINIC_ID}/${filename}`;
    const harborPath = `/clinic-branding/${HARBOR.clinicId}/${filename}`;

    const demoGet = await page.request.get(
      tenantUrl(DEMO_TENANT_SLUG, demoPath)
    );
    expect(demoGet.status()).toBe(200);
    expect(Buffer.from(await demoGet.body()).equals(FAVICON_A)).toBe(true);

    const harborGet = await page.request.get(
      tenantUrl(HARBOR_TENANT_SLUG, harborPath)
    );
    expect(harborGet.status()).toBe(404);

    await page.goto(tenantUrl(HARBOR_TENANT_SLUG, "/extraction"), {
      waitUntil: "load",
    });
    const harborHtml = await page.content();
    expect(harborHtml).not.toContain(filename);
    expect(harborHtml).not.toContain(DEMO_CLINIC_ID);
    expect(harborHtml).not.toContain("#0f766e");
    expect(harborHtml).toContain(HARBOR.primaryColor);
    assertRiverPack(harborHtml);
  });

  test("standard logo, Dark logo, and favicon all GET 200", async ({
    page,
    browserName,
  }) => {
    await e2ePrisma.clinicProfile.update({
      where: { clinicId: DEMO_CLINIC_ID },
      data: { logoUrl: null, darkLogoUrl: null, faviconUrl: null },
    });
    if (browserName === "webkit") {
      await seedBrandingAsset("logoUrl", LOGO_PNG);
      await seedBrandingAsset("darkLogoUrl", DARK_LOGO_PNG);
      await seedBrandingAsset("faviconUrl", FAVICON_A);
    } else {
      await signInAsLocalAdmin(page);
      await uploadNamedAsset(
        page,
        "#clinic-logo-file",
        "logo.png",
        LOGO_PNG,
        "Upload logo",
        "Practice logo updated."
      );
      await uploadNamedAsset(
        page,
        "#clinic-dark-logo-file",
        "dark-logo.png",
        DARK_LOGO_PNG,
        "Upload Dark logo",
        "Dark logo updated."
      );
      await uploadNamedAsset(
        page,
        "#clinic-favicon-file",
        "favicon-a.png",
        FAVICON_A,
        "Upload favicon",
        "Favicon updated."
      );
    }

    const profile = await e2ePrisma.clinicProfile.findUnique({
      where: { clinicId: DEMO_CLINIC_ID },
      select: { logoUrl: true, darkLogoUrl: true, faviconUrl: true },
    });
    expect(profile?.logoUrl).toMatch(
      /^clinics\/clinic_demo_rivers\/branding\/.+\.png$/
    );
    expect(profile?.darkLogoUrl).toMatch(
      /^clinics\/clinic_demo_rivers\/branding\/.+\.png$/
    );
    expect(profile?.faviconUrl).toMatch(
      /^clinics\/clinic_demo_rivers\/branding\/.+\.png$/
    );

    for (const key of [
      profile!.logoUrl!,
      profile!.darkLogoUrl!,
      profile!.faviconUrl!,
    ]) {
      const response = await page.request.get(
        tenantUrl(DEMO_TENANT_SLUG, publicBrandingPath(key))
      );
      expect(response.status(), key).toBe(200);
      expect(response.headers()["content-type"]).toContain("image/png");
    }

    const lightSrc = publicBrandingPath(profile!.logoUrl!);
    const darkSrc = publicBrandingPath(profile!.darkLogoUrl!);

    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(tenantUrl(DEMO_TENANT_SLUG, "/extraction"), {
      waitUntil: "load",
    });
    await expect(page.locator(`header img[src="${lightSrc}"]`)).toHaveCount(1);
    await expect(page.locator(`header img[src="${darkSrc}"]`)).toHaveCount(1);

    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload({ waitUntil: "load" });
    await expect(page.locator(`header img[src="${darkSrc}"]`)).toHaveCount(1);
  });
});
