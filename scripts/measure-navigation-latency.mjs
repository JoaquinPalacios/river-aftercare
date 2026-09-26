import "dotenv/config";

import { chromium } from "@playwright/test";

import { resolveLocalLoginSeed } from "../lib/dev/local-login-accounts.ts";

const SAMPLES = Number(process.env.NAV_SAMPLES ?? 20);
const PORT = process.env.NAV_PORT ?? "4173";
const MARKETING = `http://localhost:${PORT}`;
const STAFF = `http://app.localhost:${PORT}`;

function percentile(sorted, p) {
  if (sorted.length === 0) {
    return null;
  }
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[index];
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    n: sorted.length,
    min: sorted[0],
    median: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1],
  };
}

async function measureClickToUrl(page, url, click) {
  const started = Date.now();
  await Promise.all([page.waitForURL(url), click()]);
  return Date.now() - started;
}

async function runCase(page, label, setup, to, click) {
  await setup();
  for (let i = 0; i < 2; i += 1) {
    await measureClickToUrl(page, to, click);
    await setup();
  }

  const samples = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    samples.push(await measureClickToUrl(page, to, click));
    await setup();
  }

  return { label, ...summarize(samples) };
}

async function openClinicsMenu(page) {
  await page
    .getByRole("navigation", { name: "Marketing" })
    .getByRole("button", { name: "For clinics" })
    .click();
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  const nav = () => page.getByRole("navigation", { name: "Marketing" });
  const results = [];

  results.push(
    await runCase(
      page,
      "/ → /about",
      () => page.goto(`${MARKETING}/`, { waitUntil: "load" }),
      `${MARKETING}/about`,
      () => nav().getByRole("link", { name: "About" }).click()
    )
  );
  results.push(
    await runCase(
      page,
      "/ → /pricing",
      () => page.goto(`${MARKETING}/`, { waitUntil: "load" }),
      `${MARKETING}/pricing`,
      () => nav().getByRole("link", { name: "Pricing" }).click()
    )
  );
  results.push(
    await runCase(
      page,
      "/ → /clinics",
      async () => {
        await page.goto(`${MARKETING}/`, { waitUntil: "load" });
        await openClinicsMenu(page);
      },
      `${MARKETING}/clinics`,
      () => nav().getByRole("link", { name: "Overview" }).click()
    )
  );
  results.push(
    await runCase(
      page,
      "/clinics → /dental",
      async () => {
        await page.goto(`${MARKETING}/clinics`, { waitUntil: "load" });
        await openClinicsMenu(page);
      },
      `${MARKETING}/dental`,
      () => nav().getByRole("link", { name: "Dental" }).click()
    )
  );
  results.push(
    await runCase(
      page,
      "/dental → /contact",
      () => page.goto(`${MARKETING}/dental`, { waitUntil: "load" }),
      `${MARKETING}/contact`,
      () => nav().getByRole("link", { name: "Contact" }).click()
    )
  );

  const login = resolveLocalLoginSeed();
  if (login.status === "invalid" || login.status === "refused") {
    throw new Error(login.reason);
  }
  const admin =
    login.status === "seed"
      ? login.accounts.find((account) => account.role === "ADMIN")
      : null;
  if (admin) {
    await page.goto(`${STAFF}/login`, { waitUntil: "load" });
    await page.getByLabel("Email").fill(admin.email);
    await page.getByLabel("Password", { exact: true }).fill(admin.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(`${STAFF}/dashboard`);

    results.push(
      await runCase(
        page,
        "/dashboard → /guides",
        () => page.goto(`${STAFF}/dashboard`, { waitUntil: "load" }),
        `${STAFF}/guides`,
        () =>
          page
            .locator(".staffAppSidebar")
            .getByRole("link", { name: "Guides" })
            .click()
      )
    );
    results.push(
      await runCase(
        page,
        "/dashboard → /account/security",
        () => page.goto(`${STAFF}/dashboard`, { waitUntil: "load" }),
        `${STAFF}/account/security`,
        () =>
          page
            .locator(".staffAppSidebar")
            .getByRole("link", { name: "Account security" })
            .click()
      )
    );
  }

  await browser.close();
  console.log(
    JSON.stringify({ port: PORT, samplesPerCase: SAMPLES, results }, null, 2)
  );
}

await main();
