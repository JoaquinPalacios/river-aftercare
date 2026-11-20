import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { REGISTRATION_INTENT_CRON_PATH } from "@/lib/auth/registration-cron-path";
import {
  REGISTRATION_INTENT_EXPIRE_BATCH,
  REGISTRATION_INTENT_EXPIRE_PASSES,
} from "@/lib/auth/registration-cleanup";

const BILLING_NOTICE_CRON_PATH = "/api/cron/billing-notices";

type RegistrationSchedule = {
  schedule: string;
  timezone: string;
  path: string;
  requestMethod: string;
  jitter?: number;
};

type VercelConfig = {
  regions?: string[];
  crons?: unknown;
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
  it("schedules only registration-intent cleanup", () => {
    expect(vercelConfig.regions).toEqual(["syd1"]);
    expect(vercelConfig.crons).toBeUndefined();
    expect(vercelConfig.schedules).toEqual({
      "registration-intents-cleanup": {
        schedule: "30 21 * * *",
        timezone: "UTC",
        path: REGISTRATION_INTENT_CRON_PATH,
        requestMethod: "GET",
      },
    });
    expect(JSON.stringify(vercelConfig)).not.toContain(
      BILLING_NOTICE_CRON_PATH
    );
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

  it("keeps the existing GET handler and bounded cleanup", () => {
    const route = readFileSync(
      "app/api/cron/registration-intents/route.ts",
      "utf8"
    );
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies?: { next?: string };
    };

    expect(route).toContain("export async function GET");
    expect(route).not.toMatch(/export async function POST/);
    expect(route).toContain("process.env.CRON_SECRET");
    expect(route).toContain("billingNoticeCronAuthorized");
    expect(pkg.dependencies?.next).toBe("16.4.6");
    expect(REGISTRATION_INTENT_EXPIRE_BATCH).toBe(500);
    expect(REGISTRATION_INTENT_EXPIRE_PASSES).toBe(4);
    expect(
      readFileSync("app/api/cron/billing-notices/route.ts", "utf8")
    ).toContain("export async function GET");
  });
});
