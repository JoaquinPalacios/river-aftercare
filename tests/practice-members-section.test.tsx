/** @vitest-environment jsdom */

import { ClinicMembershipRole } from "@prisma/client";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refreshMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("@/app/(staff)/(clinic-portal)/practice/membership-actions", () => ({
  updateStaffMembershipStatusAction: vi.fn(),
  invitePracticeMemberAction: vi.fn(),
}));

import { PracticeMembersSection } from "@/app/(staff)/(clinic-portal)/practice/practice-members-section";
import type { PracticeMemberRow } from "@/lib/clinic-portal/list-practice-members";

const members: PracticeMemberRow[] = [
  {
    membershipId: "membership_admin",
    userId: "user_admin",
    name: "Demo Admin",
    email: "admin@example.test",
    role: ClinicMembershipRole.ADMIN,
    active: true,
  },
  {
    membershipId: "membership_staff",
    userId: "user_staff",
    name: "Demo Staff",
    email: "staff@example.test",
    role: ClinicMembershipRole.STAFF,
    active: true,
  },
];

describe("Practice members invite UI", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    refreshMock.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  async function renderSection(
    props: Partial<{
      rows: PracticeMemberRow[];
      canInvite: boolean;
      operatorTeamHref: string | null;
    }> = {}
  ) {
    await act(async () => {
      root.render(
        <PracticeMembersSection
          clinicName="Empty Clinic"
          rows={props.rows ?? []}
          canInvite={props.canInvite ?? false}
          operatorTeamHref={props.operatorTeamHref ?? null}
          allowance={{
            governed: false,
            occupiedPlaces: 0,
            activeMemberCount: 0,
            pendingInvitationCount: 0,
            baseLimit: null,
            extraAllowance: null,
            planLimit: null,
            remainingPlaces: null,
            atLimit: false,
            usageLabel: null,
            detailLabel: null,
          }}
          contactHref="https://example.test/contact"
        />
      );
    });
  }

  it("shows invite on a clinic with zero members", async () => {
    await renderSection({ canInvite: true });
    expect(container.textContent).toContain("No members yet.");
    expect(container.textContent).toContain("Invite member");
    expect(container.textContent).toContain("Send invitation");
    expect(container.querySelector('input[name="clinicId"]')).toBeNull();
    expect(container.querySelector('option[value="OPERATOR"]')).toBeNull();
    expect(container.textContent).not.toMatch(/seats/i);
    expect(container.textContent).not.toMatch(/\d+\s*\/\s*\d+/);
  });

  it("still shows invite when members already exist", async () => {
    await renderSection({ canInvite: true, rows: members });
    expect(container.textContent).toContain("Demo Admin");
    expect(container.textContent).toContain("Send invitation");
    expect(container.textContent).not.toMatch(/seats/i);
  });

  it("hides invite when the actor cannot manage members", async () => {
    await renderSection({ canInvite: false, rows: members });
    expect(container.textContent).not.toContain("Invite member");
    expect(container.textContent).not.toContain("Send invitation");
    expect(container.textContent).not.toContain("Manage team");
  });

  it("links an assisting operator to the existing team page", async () => {
    await renderSection({
      canInvite: true,
      operatorTeamHref: "/operator/clinics/clinic_empty/team",
    });
    const link = container.querySelector("a");
    expect(link?.textContent).toContain("Manage team");
    expect(link?.getAttribute("href")).toBe(
      "/operator/clinics/clinic_empty/team"
    );
  });

  it("separates the members card from the practice section stack", () => {
    const page = readFileSync(
      "app/(staff)/(clinic-portal)/practice/page.tsx",
      "utf8"
    );
    const css = readFileSync("app/(staff)/staff.css", "utf8");
    const membersSource = readFileSync(
      "app/(staff)/(clinic-portal)/practice/practice-members-section.tsx",
      "utf8"
    );
    expect(page).toContain("staffPracticePage");
    expect(membersSource).not.toContain("mt-8");
    const pageRule = css.match(/\.staffPracticePage\s*\{[^}]*\}/)?.[0] ?? "";
    const formRule = css.match(/\.staffPracticeForm\s*\{[^}]*\}/)?.[0] ?? "";
    const headerRule =
      css.match(/\.staffPracticeHeader\s*\{[^}]*\}/)?.[0] ?? "";
    expect(pageRule).toContain("gap: 2rem");
    expect(formRule).toContain("gap: 2rem");
    expect(headerRule).not.toContain("margin-bottom");
    expect(page).toContain("operator_support");
    expect(page).toContain("operatorTeamHref");
  });
});
