import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const notFoundMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());
const getAuthContextMock = vi.hoisted(() => vi.fn());
const headersMock = vi.hoisted(() => vi.fn());
const inviteMock = vi.hoisted(() => vi.fn());
const resendMock = vi.hoisted(() => vi.fn());
const cancelMock = vi.hoisted(() => vi.fn());
const removeMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
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

vi.mock("@/lib/operator/invite-clinic-user", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/operator/invite-clinic-user")>();
  return {
    ...actual,
    inviteClinicUser: inviteMock,
  };
});

vi.mock("@/lib/operator/resend-clinic-invitation", () => ({
  resendClinicInvitation: resendMock,
}));

vi.mock("@/lib/operator/cancel-clinic-invitation", () => ({
  cancelClinicInvitation: cancelMock,
}));

vi.mock("@/lib/operator/remove-clinic-access", () => ({
  removeClinicAccess: removeMock,
}));

import {
  cancelClinicInvitationAction,
  inviteClinicUserAction,
  removeClinicAccessAction,
  resendClinicInvitationAction,
} from "@/app/(staff)/(operator)/operator/clinics/[clinicId]/team/actions";
import { INVITATION_DELIVERY_FAILED_MESSAGE } from "@/lib/operator/invite-clinic-user";

const operator = {
  id: "user_operator",
  email: "operator@care-guide.test",
  name: "Demo Operator",
  platformRole: "OPERATOR",
};

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

describe("clinic team operator actions", () => {
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;

  beforeEach(() => {
    notFoundMock.mockReset();
    redirectMock.mockReset();
    getAuthContextMock.mockReset();
    headersMock.mockReset();
    inviteMock.mockReset();
    resendMock.mockReset();
    cancelMock.mockReset();
    removeMock.mockReset();
    notFoundMock.mockImplementation(() => {
      throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    });
    redirectMock.mockImplementation((url: string) => {
      const error = new Error(`NEXT_REDIRECT:${url}`) as Error & {
        digest: string;
      };
      error.digest = `NEXT_REDIRECT;replace;${url};303`;
      throw error;
    });
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    headersMock.mockResolvedValue(new Headers({ host: "app.localhost:3000" }));
  });

  afterEach(() => {
    if (previousRoot === undefined) {
      delete process.env.CARE_GUIDE_ROOT_DOMAIN;
    } else {
      process.env.CARE_GUIDE_ROOT_DOMAIN = previousRoot;
    }
  });

  it("lets an operator invite a user and redirects to Team", async () => {
    getAuthContextMock.mockResolvedValue({
      user: operator,
      clinicMembership: null,
    });
    inviteMock.mockResolvedValue({
      ok: true,
      outcome: "INVITATION_SENT",
      delivered: true,
      email: "jane@example.test",
      userId: "user_jane",
    });

    await expect(
      inviteClinicUserAction(
        {},
        form({
          clinicId: "clinic_1",
          name: "Jane Example",
          email: "jane@example.test",
          role: "STAFF",
          platformRole: "OPERATOR",
          passwordHash: "should-be-ignored",
        })
      )
    ).rejects.toThrow(
      "NEXT_REDIRECT:/operator/clinics/clinic_1/team?status=invitation-sent"
    );
    expect(inviteMock).toHaveBeenCalledWith({
      clinicId: "clinic_1",
      invitedByUserId: operator.id,
      name: "Jane Example",
      email: "jane@example.test",
      role: "STAFF",
    });
  });

  it("redirects restored access without claiming an invitation was sent", async () => {
    getAuthContextMock.mockResolvedValue({
      user: operator,
      clinicMembership: null,
    });
    inviteMock.mockResolvedValue({
      ok: true,
      outcome: "ACCESS_RESTORED",
      email: "orphan@example.test",
      userId: "user_orphan",
    });

    await expect(
      inviteClinicUserAction(
        {},
        form({
          clinicId: "clinic_1",
          name: "Orphan",
          email: "orphan@example.test",
          role: "ADMIN",
        })
      )
    ).rejects.toThrow(
      "NEXT_REDIRECT:/operator/clinics/clinic_1/team?status=access-restored"
    );
  });

  it("stays on Invite user when delivery fails", async () => {
    getAuthContextMock.mockResolvedValue({
      user: operator,
      clinicMembership: null,
    });
    inviteMock.mockResolvedValue({
      ok: true,
      outcome: "INVITATION_SENT",
      delivered: false,
      email: "nomail@example.test",
      userId: "user_nomail",
    });

    await expect(
      inviteClinicUserAction(
        {},
        form({
          clinicId: "clinic_1",
          name: "No Mail",
          email: "nomail@example.test",
          role: "STAFF",
        })
      )
    ).resolves.toEqual({ error: INVITATION_DELIVERY_FAILED_MESSAGE });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("lets an operator remove access and redirects to Team", async () => {
    getAuthContextMock.mockResolvedValue({
      user: operator,
      clinicMembership: null,
    });
    removeMock.mockResolvedValue({ ok: true, userId: "user_jane" });

    await expect(
      removeClinicAccessAction(
        {},
        form({ clinicId: "clinic_1", membershipId: "membership_1" })
      )
    ).rejects.toThrow(
      "NEXT_REDIRECT:/operator/clinics/clinic_1/team?status=access-removed"
    );
    expect(removeMock).toHaveBeenCalledWith({
      clinicId: "clinic_1",
      membershipId: "membership_1",
    });
  });

  it("rejects anonymous callers", async () => {
    getAuthContextMock.mockResolvedValue({
      user: null,
      clinicMembership: null,
    });
    await expect(
      inviteClinicUserAction(
        {},
        form({
          clinicId: "clinic_1",
          name: "Jane Example",
          email: "jane@example.test",
          role: "STAFF",
        })
      )
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(inviteMock).not.toHaveBeenCalled();
    await expect(
      removeClinicAccessAction(
        {},
        form({ clinicId: "clinic_1", membershipId: "membership_1" })
      )
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("rejects clinic ADMIN and STAFF", async () => {
    getAuthContextMock.mockResolvedValue({
      user: {
        id: "user_admin",
        email: "admin@care-guide.test",
        name: "Demo Admin",
        platformRole: "NONE",
      },
      clinicMembership: {
        membershipId: "membership_1",
        role: "ADMIN",
        clinic: { id: "clinic_1", name: "Riverside" },
      },
    });
    await expect(
      inviteClinicUserAction(
        {},
        form({
          clinicId: "clinic_1",
          name: "Jane Example",
          email: "jane@example.test",
          role: "STAFF",
        })
      )
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(inviteMock).not.toHaveBeenCalled();
    await expect(
      removeClinicAccessAction(
        {},
        form({ clinicId: "clinic_1", membershipId: "membership_1" })
      )
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(removeMock).not.toHaveBeenCalled();

    getAuthContextMock.mockResolvedValue({
      user: {
        id: "user_staff",
        email: "staff@care-guide.test",
        name: "Demo Staff",
        platformRole: "NONE",
      },
      clinicMembership: {
        membershipId: "membership_2",
        role: "STAFF",
        clinic: { id: "clinic_1", name: "Riverside" },
      },
    });
    await expect(
      resendClinicInvitationAction(
        {},
        form({ clinicId: "clinic_1", userId: "user_pending" })
      )
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    await expect(
      cancelClinicInvitationAction(
        {},
        form({ clinicId: "clinic_1", userId: "user_pending" })
      )
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    await expect(
      removeClinicAccessAction(
        {},
        form({ clinicId: "clinic_1", membershipId: "membership_2" })
      )
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("404s clinic team mutations on a non-staff host", async () => {
    headersMock.mockResolvedValue(
      new Headers({ host: "demodental.localhost:3000" })
    );
    getAuthContextMock.mockResolvedValue({
      user: operator,
      clinicMembership: null,
    });

    await expect(
      inviteClinicUserAction(
        {},
        form({
          clinicId: "clinic_1",
          name: "Jane Example",
          email: "jane@example.test",
          role: "STAFF",
        })
      )
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(inviteMock).not.toHaveBeenCalled();
    await expect(
      removeClinicAccessAction(
        {},
        form({ clinicId: "clinic_1", membershipId: "membership_1" })
      )
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(removeMock).not.toHaveBeenCalled();
  });
});
