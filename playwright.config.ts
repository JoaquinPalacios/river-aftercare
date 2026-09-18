import "dotenv/config";

import { defineConfig } from "@playwright/test";

import { e2eDatabaseUrl } from "./e2e/helpers/database";
import { E2E_PORT, staffOrigin } from "./e2e/helpers/origins";

const staffUrl = staffOrigin();
const e2eUrl = e2eDatabaseUrl();

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  outputDir: "test-results",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: staffUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `pnpm exec next start --port ${E2E_PORT}`,
    url: staffUrl,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      DATABASE_URL: e2eUrl,
      CLINIC_ASSET_STORAGE_DRIVER: "memory",
      CONTACT_EMAIL_TO: process.env.CONTACT_EMAIL_TO ?? "hello@example.test",
      CONTACT_EMAIL_FROM:
        process.env.CONTACT_EMAIL_FROM ??
        "River Aftercare <website@example.test>",
      CONTACT_MAILER: process.env.CONTACT_MAILER ?? "memory",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY:
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ??
        "1x00000000000000000000AA",
      TURNSTILE_SECRET_KEY:
        process.env.TURNSTILE_SECRET_KEY ??
        "1x0000000000000000000000000000000AA",
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
});
