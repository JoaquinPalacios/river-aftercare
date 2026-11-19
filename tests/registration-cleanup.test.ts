import { beforeEach, describe, expect, it, vi } from "vitest";

const { expireRegistrationIntents, reportServerException } = vi.hoisted(() => ({
  expireRegistrationIntents: vi.fn(),
  reportServerException: vi.fn(),
}));

vi.mock("@/lib/auth/registration-intent-service", () => ({
  expireRegistrationIntents,
}));

vi.mock("@/lib/observability/report-server-exception", () => ({
  reportServerException,
}));

import { runRegistrationIntentCleanup } from "@/lib/auth/registration-cleanup";

describe("registration intent cleanup bound", () => {
  beforeEach(() => {
    expireRegistrationIntents.mockReset();
    reportServerException.mockReset();
  });

  it("stops when a batch is smaller than the cap", async () => {
    expireRegistrationIntents
      .mockResolvedValueOnce({ revoked: 500 })
      .mockResolvedValueOnce({ revoked: 12 });

    await expect(
      runRegistrationIntentCleanup(new Date("2026-11-19T00:00:00.000Z"))
    ).resolves.toEqual({ revoked: 512, backlog: false });
    expect(expireRegistrationIntents).toHaveBeenCalledTimes(2);
    expect(reportServerException).not.toHaveBeenCalled();
  });

  it("reports a backlog after four full batches and does not keep going", async () => {
    expireRegistrationIntents.mockResolvedValue({ revoked: 500 });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runRegistrationIntentCleanup()).resolves.toEqual({
      revoked: 2000,
      backlog: true,
    });
    expect(expireRegistrationIntents).toHaveBeenCalledTimes(4);
    expect(reportServerException).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "registration_intent_expiry_backlog",
        reason: "cleanup_backlog",
      })
    );
    error.mockRestore();
  });
});
