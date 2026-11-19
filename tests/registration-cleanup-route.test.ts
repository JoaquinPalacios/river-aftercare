import { beforeEach, describe, expect, it, vi } from "vitest";

const runRegistrationIntentCleanup = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/registration-cleanup", () => ({
  runRegistrationIntentCleanup,
}));

vi.mock("@/lib/observability/report-server-exception", () => ({
  reportServerException: vi.fn(),
}));

import { GET } from "@/app/api/cron/registration-intents/route";

function request(headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/cron/registration-intents", {
    headers,
  });
}

describe("registration intent cleanup route", () => {
  beforeEach(() => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    process.env.CRON_SECRET = "cron-test-secret";
    runRegistrationIntentCleanup.mockReset();
    runRegistrationIntentCleanup.mockResolvedValue({
      revoked: 2,
      backlog: false,
    });
  });

  it("rejects a missing secret, a patient host, and reports a failed sweep", async () => {
    const unauthorized = await GET(request({ host: "localhost:3000" }));
    expect(unauthorized.status).toBe(401);
    expect(runRegistrationIntentCleanup).not.toHaveBeenCalled();

    const patient = await GET(
      request({
        host: "demodental.localhost:3000",
        authorization: "Bearer cron-test-secret",
      })
    );
    expect(patient.status).toBe(404);
    expect(runRegistrationIntentCleanup).not.toHaveBeenCalled();

    runRegistrationIntentCleanup.mockRejectedValueOnce(new Error("db down"));
    const failed = await GET(
      request({
        host: "localhost:3000",
        authorization: "Bearer cron-test-secret",
      })
    );
    expect(failed.status).toBe(500);
    const body = await failed.json();
    expect(body).toEqual({
      error: "Registration cleanup could not be completed.",
    });
    expect(JSON.stringify(body)).not.toMatch(/password|token|email/i);
  });

  it("returns the revoked count for an authorized marketing or staff host", async () => {
    const marketing = await GET(
      request({
        host: "localhost:3000",
        authorization: "Bearer cron-test-secret",
      })
    );
    expect(marketing.status).toBe(200);
    await expect(marketing.json()).resolves.toEqual({
      ok: true,
      revoked: 2,
      backlog: false,
    });

    const staff = await GET(
      request({
        host: "app.localhost:3000",
        authorization: "Bearer cron-test-secret",
      })
    );
    expect(staff.status).toBe(200);
    expect(runRegistrationIntentCleanup).toHaveBeenCalledTimes(2);
  });
});
