import { beforeEach, describe, expect, it, vi } from "vitest";

const runRegistrationIntentCleanup = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/registration-cleanup", () => ({
  runRegistrationIntentCleanup,
}));

import { POST } from "@/lib/schedules/registration-intents-cleanup";

const EXECUTION_ID = "schx_test_execution";

function scheduleRequest(): Request {
  return new Request("https://example.invalid/registration-intents-cleanup", {
    method: "POST",
    headers: {
      "ce-specversion": "1.0",
      "ce-type": "com.vercel.schedule.v1beta",
      "ce-source": "/schedule/default/registration-intents-cleanup",
      "ce-id": EXECUTION_ID,
      "ce-vssscheduleid": "sch_test",
      "ce-vssschedulename": "registration-intents-cleanup",
      "ce-vssnamespace": "default",
      "ce-vssscheduledat": "2026-11-20T21:30:00.000Z",
      "ce-vssschedulesource": "static",
      "ce-vssexpression": "30 21 * * *",
    },
  });
}

describe("private registration intent schedule", () => {
  beforeEach(() => {
    runRegistrationIntentCleanup.mockReset();
  });

  it("rejects a request that is not a schedule dispatch and does no cleanup", async () => {
    const response = await POST(
      new Request("https://example.invalid/registration-intents-cleanup", {
        method: "POST",
      })
    );

    expect(response.status).toBe(400);
    expect(runRegistrationIntentCleanup).not.toHaveBeenCalled();
    const body = await response.json();
    expect(JSON.stringify(body)).not.toMatch(/password|token|email|secret/i);
  });

  it("awaits a successful or empty cleanup and logs only the execution result", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    runRegistrationIntentCleanup.mockResolvedValueOnce({
      revoked: 3,
      backlog: false,
    });

    const completed = await POST(scheduleRequest());
    expect(completed.status).toBe(200);
    expect(runRegistrationIntentCleanup).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith({
      event: "registration_intent_cleanup_completed",
      schedule: "registration-intents-cleanup",
      executionId: EXECUTION_ID,
      revoked: 3,
      backlog: false,
    });

    runRegistrationIntentCleanup.mockResolvedValueOnce({
      revoked: 0,
      backlog: false,
    });
    const empty = await POST(scheduleRequest());
    expect(empty.status).toBe(200);
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ revoked: 0, backlog: false })
    );
    expect(JSON.stringify(info.mock.calls)).not.toMatch(
      /password|passwordHash|@|token|secret/i
    );
    info.mockRestore();
  });

  it("logs a failed run without the error text and propagates the failure", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    runRegistrationIntentCleanup.mockRejectedValueOnce(
      new Error("database unavailable for owner@example.test")
    );

    await expect(POST(scheduleRequest())).rejects.toThrow(
      "database unavailable for owner@example.test"
    );
    expect(runRegistrationIntentCleanup).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith({
      event: "registration_intent_cleanup_failed",
      schedule: "registration-intents-cleanup",
      executionId: EXECUTION_ID,
      name: "Error",
    });
    expect(JSON.stringify(error.mock.calls)).not.toMatch(
      /owner@example\.test|password|token/
    );
    error.mockRestore();
  });
});
