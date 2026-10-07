import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-staff-session", () => ({
  requireStaffSession: vi.fn(async () => ({
    user: {
      id: "user_ada",
      email: "ada@riverside.example.test",
      name: "Ada Admin",
      platformRole: "NONE",
    },
    clinicMembership: {
      membershipId: "membership_1",
      role: "ADMIN",
      clinic: { id: "clinic_riverside", name: "Riverside Dental" },
    },
  })),
}));

vi.mock("@/app/(staff)/account/help/actions", () => ({
  submitHelpFeedbackAction: vi.fn(),
}));

import { renderToStaticMarkup } from "react-dom/server";

import HelpFeedbackPage from "@/app/(staff)/account/help/page";
import { HELP_FEEDBACK_PATIENT_WARNING } from "@/lib/support/help-feedback-fields";

describe("Help & feedback page", () => {
  beforeEach(() => {
    process.env.CARE_GUIDE_ROOT_DOMAIN ??= "localhost";
  });

  it("offers the three request types to a signed-in clinic member", async () => {
    const html = renderToStaticMarkup(
      await HelpFeedbackPage({
        searchParams: Promise.resolve({ from: "/guides/guide_1" }),
      })
    );

    expect(html).toContain("Help &amp; feedback");
    expect(html).toContain("Report a problem");
    expect(html).toContain("Ask a question");
    expect(html).toContain("Suggest a feature");
    expect(html).toContain("Choose an option to continue.");
    expect(html).not.toContain(HELP_FEEDBACK_PATIENT_WARNING);
    expect(html).not.toContain("support@");
    expect(html).not.toContain("RIVER_AFTERCARE_SUPPORT_EMAIL");
    expect(html).not.toContain("https://evil.test");
  });

  it("does not accept an external page address", async () => {
    const html = renderToStaticMarkup(
      await HelpFeedbackPage({
        searchParams: Promise.resolve({
          from: "https://evil.test/phish",
        }),
      })
    );

    expect(html).not.toContain("evil.test");
    expect(html).not.toContain("https://");
  });
});
