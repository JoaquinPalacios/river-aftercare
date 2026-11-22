import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { REGISTRATION_INTENT_CRON_PATH } from "@/lib/auth/registration-cron-path";
import {
  REGISTRATION_INTENT_EXPIRE_BATCH,
  REGISTRATION_INTENT_EXPIRE_PASSES,
} from "@/lib/auth/registration-cleanup";

const BILLING_NOTICE_CRON_PATH = "/api/cron/billing-notices";
const SCHEDULE_FUNCTION = "api/registration-intents-cleanup";

type RegistrationSchedule = {
  schedule: string;
  timezone: string;
  function: string;
  path?: string;
  requestMethod?: string;
  jitter?: number;
};

type VercelConfig = {
  regions?: string[];
  crons?: unknown;
  functions?: Record<
    string,
    { experimentalTriggers?: Array<{ type?: string }> }
  >;
  schedules?: Record<string, RegistrationSchedule>;
};

const vercelConfig = JSON.parse(
  readFileSync("vercel.json", "utf8")
) as VercelConfig;

function minimumIntervalMinutes(expression: string): number {
  const fields = expression.split(" ");
  if (fields.length !== 5) {
    return 0;
  }
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  const single = (field: string, max: number) => {
    if (!/^\d+$/.test(field)) {
      return false;
    }
    const value = Number(field);
    return value >= 0 && value <= max;
  };
  if (
    single(minute, 59) &&
    single(hour, 23) &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return 24 * 60;
  }
  return 0;
}

describe("Vercel Schedules configuration", () => {
  it("schedules only the private registration-intent cleanup function", () => {
    expect(vercelConfig.regions).toEqual(["syd1"]);
    expect(vercelConfig.crons).toBeUndefined();
    expect(vercelConfig.schedules).toEqual({
      "registration-intents-cleanup": {
        schedule: "30 21 * * *",
        timezone: "UTC",
        function: SCHEDULE_FUNCTION,
      },
    });
    expect(
      vercelConfig.functions?.["api/registration-intents-cleanup.js"]
    ).toEqual({
      experimentalTriggers: [{ type: "schedule/v1beta" }],
    });
    expect(Object.keys(vercelConfig.functions ?? {})).toEqual([
      "api/registration-intents-cleanup.js",
    ]);
    const serialized = JSON.stringify(vercelConfig);
    expect(serialized).not.toContain(BILLING_NOTICE_CRON_PATH);
    expect(serialized).not.toContain(REGISTRATION_INTENT_CRON_PATH);
    expect(serialized).not.toContain('"path"');
    expect(serialized).not.toContain("requestMethod");
  });

  it("stays within the Vercel Hobby schedule limits", () => {
    const schedule = vercelConfig.schedules?.["registration-intents-cleanup"];
    expect(schedule).toBeDefined();
    expect(
      minimumIntervalMinutes(schedule?.schedule ?? "")
    ).toBeGreaterThanOrEqual(15);
    expect(schedule).not.toHaveProperty("jitter");
    expect(Object.keys(vercelConfig.schedules ?? {})).toHaveLength(1);
  });

  it("keeps the HTTP handler, the private function, and the bounded cleanup", () => {
    const route = readFileSync(
      "app/api/cron/registration-intents/route.ts",
      "utf8"
    );
    const scheduled = readFileSync(
      "lib/schedules/registration-intents-cleanup.ts",
      "utf8"
    );
    const bundleScript = readFileSync(
      "scripts/bundle-registration-intent-schedule.mjs",
      "utf8"
    );
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: { build?: string };
      dependencies?: { next?: string; "@vercel/schedules"?: string };
    };

    expect(route).toContain("export async function GET");
    expect(route).not.toMatch(/export async function POST/);
    expect(route).toContain("process.env.CRON_SECRET");
    expect(route).toContain("billingNoticeCronAuthorized");
    expect(route).toContain("billingNoticeCronHostAllowed");
    expect(scheduled).toContain("handleSchedule");
    expect(scheduled).toContain("await runRegistrationIntentCleanup()");
    expect(scheduled).toContain("throw error");
    expect(bundleScript).toContain("empty-server-only");
    expect(bundleScript).toContain("sideEffects: false");
    expect(bundleScript).toContain(
      "lib/schedules/registration-intents-cleanup-bundle.js"
    );
    const trackedEntry = readFileSync(
      "api/registration-intents-cleanup.js",
      "utf8"
    );
    expect(trackedEntry).toContain(
      "../lib/schedules/registration-intents-cleanup-bundle.js"
    );
    expect(trackedEntry).not.toContain("@/");
    expect(() =>
      execFileSync("git", [
        "check-ignore",
        "-q",
        "api/registration-intents-cleanup.js",
      ])
    ).toThrow();
    execFileSync("git", [
      "check-ignore",
      "-q",
      "lib/schedules/registration-intents-cleanup-bundle.js",
    ]);
    expect(pkg.scripts?.build).toContain(
      "node scripts/bundle-registration-intent-schedule.mjs"
    );
    expect(pkg.dependencies?.next).toBe("16.4.6");
    expect(pkg.dependencies?.["@vercel/schedules"]).toBe("0.0.3");
    expect(REGISTRATION_INTENT_EXPIRE_BATCH).toBe(500);
    expect(REGISTRATION_INTENT_EXPIRE_PASSES).toBe(4);
    expect(
      readFileSync("app/api/cron/billing-notices/route.ts", "utf8")
    ).toContain("export async function GET");
    expect(readFileSync("proxy.ts", "utf8")).toContain(
      "REGISTRATION_INTENT_CRON_PATH"
    );
  });

  it("bundles the private function without a public Next.js import", () => {
    execFileSync("node", ["scripts/bundle-registration-intent-schedule.mjs"], {
      stdio: "pipe",
    });
    const bundled = readFileSync(
      "lib/schedules/registration-intents-cleanup-bundle.js",
      "utf8"
    );
    expect(bundled).toContain("async function expireRegistrationIntents");
    expect(bundled).toContain("async function runRegistrationIntentCleanup");
    expect(bundled).toContain("POST: () => POST");
    expect(bundled).not.toContain("next/navigation");
    expect(bundled).not.toContain(
      "This module cannot be imported from a Client Component"
    );
    expect(bundled).not.toContain('from "@/');
  });
});
