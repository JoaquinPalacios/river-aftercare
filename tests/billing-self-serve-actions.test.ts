import { ClinicMembershipRole } from "@prisma/client";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireClinicAdminMock = vi.hoisted(() => vi.fn());
const beginMock = vi.hoisted(() => vi.fn());
const scheduleMock = vi.hoisted(() => vi.fn());
const keepMock = vi.hoisted(() => vi.fn());
const cancelMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "app.localhost:3000" }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => redirectMock(url),
}));

vi.mock("@/lib/tenancy/staff-app-origin", () => ({
  isStaffAppHost: () => true,
}));

vi.mock("@/lib/auth/require-clinic-admin", () => ({
  requireClinicAdmin: requireClinicAdminMock,
}));

vi.mock("@/lib/entitlements/downgrade-selection", () => ({
  beginClinicPlanDowngrade: beginMock,
  cancelClinicDowngradePreparation: cancelMock,
  confirmClinicDowngradeSelection: vi.fn(),
  keepSelectionMessage: (code: string) => code,
}));

vi.mock("@/lib/billing/plan-downgrade", () => ({
  submitClinicPlanDowngrade: scheduleMock,
  submitClinicDowngradeReversal: keepMock,
  customerPlanDowngradeMessage: (code: string) =>
    code === "schedule_failed"
      ? "We couldn’t schedule the plan change. Your Practice plan is unchanged. Please try again."
      : code,
  customerKeepPracticeMessage: () =>
    "We couldn’t cancel the scheduled plan change. Please try again.",
}));

import {
  beginClinicPlanDowngradeAction,
  cancelClinicPlanChangeAction,
  keepPracticeAction,
  scheduleClinicPlanDowngradeAction,
} from "@/app/(staff)/account/billing/actions";

function session(input?: {
  role?: "ADMIN" | "STAFF";
  source?: "membership" | "operator_support";
  clinicId?: string;
  userId?: string;
}) {
  return {
    user: {
      id: input?.userId ?? "user_admin",
      platformRole: input?.source === "operator_support" ? "OPERATOR" : "NONE",
    },
    clinicMembership: {
      role:
        input?.role === "STAFF"
          ? ClinicMembershipRole.STAFF
          : ClinicMembershipRole.ADMIN,
      source: input?.source ?? "membership",
      clinic: { id: input?.clinicId ?? "clinic_a", name: "Harbour" },
    },
  };
}

describe("self-service plan change authorization", () => {
  beforeEach(() => {
    requireClinicAdminMock.mockReset();
    beginMock.mockReset();
    scheduleMock.mockReset();
    keepMock.mockReset();
    cancelMock.mockReset();
    redirectMock.mockReset();
    requireClinicAdminMock.mockResolvedValue(session());
    beginMock.mockResolvedValue({
      ok: true,
      guideSelectionRequired: false,
      status: "none",
    });
    scheduleMock.mockResolvedValue({
      ok: true,
      alreadyScheduled: false,
      effectiveAt: new Date("2026-10-22T00:00:00.000Z"),
    });
    keepMock.mockResolvedValue({ ok: true, alreadyReversed: false });
    cancelMock.mockResolvedValue({ ok: true });
    redirectMock.mockImplementation((url: string) => {
      const error = new Error("NEXT_REDIRECT");
      (error as Error & { digest: string }).digest = `NEXT_REDIRECT;${url}`;
      throw error;
    });
  });

  it("lets a clinic admin begin, schedule, cancel preparation, and keep Practice", async () => {
    await expect(
      beginClinicPlanDowngradeAction({}, new FormData())
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(beginMock).toHaveBeenCalledWith({ clinicId: "clinic_a" });
    expect(redirectMock).toHaveBeenCalledWith(
      "/account/billing?change-plan=essential"
    );

    const scheduled = await scheduleClinicPlanDowngradeAction(
      {},
      new FormData()
    );
    expect(scheduled).toEqual({
      notice: "scheduled",
      effectiveLabel: "22 October 2026",
    });
    expect(scheduleMock).toHaveBeenCalledWith({
      clinicId: "clinic_a",
      actorUserId: "user_admin",
    });

    const cancelled = await cancelClinicPlanChangeAction({}, new FormData());
    expect(cancelled).toEqual({ notice: "cancelled" });
    expect(cancelMock).toHaveBeenCalledWith({ clinicId: "clinic_a" });

    const kept = await keepPracticeAction({}, new FormData());
    expect(kept).toEqual({ notice: "kept" });
    expect(keepMock).toHaveBeenCalledWith({
      clinicId: "clinic_a",
      actorUserId: "user_admin",
    });
  });

  it("ignores a clinic id submitted from another clinic", async () => {
    const form = new FormData();
    form.set("clinicId", "clinic_other");
    form.set("priceId", "price_essential");
    form.set("effectiveAt", "2026-10-22");
    await scheduleClinicPlanDowngradeAction({}, form);
    expect(scheduleMock).toHaveBeenCalledWith({
      clinicId: "clinic_a",
      actorUserId: "user_admin",
    });
  });

  it("denies operator support and does not call the domain", async () => {
    requireClinicAdminMock.mockResolvedValue(
      session({ source: "operator_support" })
    );
    const result = await scheduleClinicPlanDowngradeAction({}, new FormData());
    expect(result.error).toContain("clinic administrator");
    expect(scheduleMock).not.toHaveBeenCalled();
    expect(beginMock).not.toHaveBeenCalled();
    expect(keepMock).not.toHaveBeenCalled();
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it("denies staff and unauthenticated callers before any plan change", async () => {
    requireClinicAdminMock.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(
      beginClinicPlanDowngradeAction({}, new FormData())
    ).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(
      scheduleClinicPlanDowngradeAction({}, new FormData())
    ).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(keepPracticeAction({}, new FormData())).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
    await expect(
      cancelClinicPlanChangeAction({}, new FormData())
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(beginMock).not.toHaveBeenCalled();
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it("returns a customer-safe schedule failure and does not mark success", async () => {
    scheduleMock.mockResolvedValue({ ok: false, code: "schedule_failed" });
    const result = await scheduleClinicPlanDowngradeAction({}, new FormData());
    expect(result).toEqual({
      error:
        "We couldn’t schedule the plan change. Your Practice plan is unchanged. Please try again.",
    });
    expect(result).not.toHaveProperty("notice");
  });

  it("keeps scheduling on the shared domain service and off the operator page", () => {
    const customer = readFileSync(
      "app/(staff)/account/billing/actions.ts",
      "utf8"
    );
    const operator = readFileSync(
      "app/(staff)/(operator)/operator/billing-actions.ts",
      "utf8"
    );
    const operatorForm = readFileSync(
      "app/(staff)/(operator)/operator/clinics/[clinicId]/upgrade-plan-form.tsx",
      "utf8"
    );
    expect(customer).toContain("submitClinicPlanDowngrade");
    expect(customer).toContain("submitClinicDowngradeReversal");
    expect(customer).toContain('source === "operator_support"');
    expect(customer).not.toContain("subscriptionSchedules");
    expect(customer).not.toContain("stripeCustomerId");
    expect(customer).not.toContain("priceId");
    expect(operator).not.toContain("submitClinicPlanDowngrade");
    expect(operator).not.toContain("submitClinicDowngradeReversal");
    expect(operator).not.toContain("prepareClinicDowngrade");
    expect(operator).toContain("submitOperatorPlanUpgrade");
    expect(operatorForm).not.toContain("Schedule downgrade");
    expect(operatorForm).not.toContain("Prepare downgrade");
    expect(operatorForm).not.toContain("Keep Practice");
    expect(operatorForm).toContain("Upgrade to Practice");
  });
});
