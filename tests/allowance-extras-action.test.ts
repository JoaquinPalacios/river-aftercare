import { beforeEach, describe, expect, it, vi } from "vitest";

const notFoundMock = vi.hoisted(() => vi.fn());
const getAuthContextMock = vi.hoisted(() => vi.fn());
const headersMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("@/lib/auth/session", () => ({
  getAuthContext: getAuthContextMock,
  isPlatformOperator: (user: { platformRole?: string } | null | undefined) =>
    user?.platformRole === "OPERATOR",
}));

vi.mock("@/lib/entitlements/operator-extras", () => ({
  updateOperatorAllowanceExtras: updateMock,
}));

import { updateAllowanceExtrasAction } from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/allowance-actions";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

describe("operator allowance extras action", () => {
  beforeEach(() => {
    notFoundMock.mockReset();
    getAuthContextMock.mockReset();
    headersMock.mockReset();
    updateMock.mockReset();
    notFoundMock.mockImplementation(() => {
      throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    });
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    headersMock.mockResolvedValue(new Headers({ host: "app.localhost:3000" }));
    updateMock.mockResolvedValue({
      ok: true,
      extras: { teamMembers: 1, customGuides: 0, templateAdaptations: 0 },
      effective: { teamMembers: 3, customGuides: 2, templateAdaptations: 2 },
    });
  });

  it("uses the session operator role and ignores a posted role or plan", async () => {
    getAuthContextMock.mockResolvedValue({
      user: {
        id: "user_operator",
        email: "operator@example.test",
        name: "Operator",
        platformRole: "OPERATOR",
      },
      clinicMembership: null,
    });

    await expect(
      updateAllowanceExtrasAction(
        {},
        form({
          clinicId: "clinic_1",
          extraTeamMembers: "1",
          extraCustomGuides: "0",
          extraTemplateAdaptations: "0",
          platformRole: "OPERATOR",
          commercialPlan: "PRACTICE",
          baseTeamMembers: "99",
        })
      )
    ).resolves.toEqual({ success: "Extra allowances saved." });

    expect(updateMock).toHaveBeenCalledWith({
      actorUserId: "user_operator",
      actorPlatformRole: "OPERATOR",
      clinicId: "clinic_1",
      extras: { teamMembers: 1, customGuides: 0, templateAdaptations: 0 },
    });
  });

  it("rejects a clinic administrator session before changing allowances", async () => {
    getAuthContextMock.mockResolvedValue({
      user: {
        id: "user_admin",
        email: "admin@example.test",
        name: "Admin",
        platformRole: "NONE",
      },
      clinicMembership: {
        role: "ADMIN",
        clinic: { id: "clinic_1" },
      },
    });

    await expect(
      updateAllowanceExtrasAction(
        {},
        form({
          clinicId: "clinic_1",
          extraTeamMembers: "5",
          extraCustomGuides: "5",
          extraTemplateAdaptations: "5",
          platformRole: "OPERATOR",
        })
      )
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects a clinic staff session", async () => {
    getAuthContextMock.mockResolvedValue({
      user: {
        id: "user_staff",
        email: "staff@example.test",
        name: "Staff",
        platformRole: "NONE",
      },
      clinicMembership: {
        role: "STAFF",
        clinic: { id: "clinic_1" },
      },
    });

    await expect(
      updateAllowanceExtrasAction(
        {},
        form({
          clinicId: "clinic_1",
          extraTeamMembers: "1",
          extraCustomGuides: "1",
          extraTemplateAdaptations: "1",
        })
      )
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(updateMock).not.toHaveBeenCalled();
  });
});
