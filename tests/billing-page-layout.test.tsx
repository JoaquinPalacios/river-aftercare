import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(staff)/account/billing/actions", () => ({
  confirmDowngradeGuideSelectionAction: async () => ({}),
  openCustomerPortalAction: async () => ({}),
}));

vi.mock("@/app/(staff)/account/billing/billing-context", () => ({
  loadBillingPageContext: vi.fn(),
}));

import { loadBillingPageContext } from "@/app/(staff)/account/billing/billing-context";
import BillingStatusPage from "@/app/(staff)/account/billing/page";

describe("billing page width", () => {
  beforeEach(() => {
    vi.mocked(loadBillingPageContext).mockReset();
  });

  it("uses the wide staff frame and keeps billing text in a reading column", async () => {
    vi.mocked(loadBillingPageContext).mockResolvedValue({
      userId: "user_1",
      membership: {
        role: "ADMIN",
        source: "membership",
      },
      contactHref: "/contact",
      termsHref: "/terms",
      privacyHref: "/privacy",
      view: {
        clinicName: "Harbour Dental",
        presentation: {
          kind: "active",
          productAccess: true,
          assistedSetup: false,
          planName: "Practice",
          intervalLabel: "Monthly",
          attention: null,
          attentionMessage: null,
        },
        summary: {
          priceLabel: "A$119 / month",
        },
        billingLabel: "Active",
        planLabel: "Practice",
        intervalLabel: "Monthly",
        paidThroughLabel: "22 October 2026",
        periodLabel: "Paid through",
        portalEligible: false,
        entitlementStatus: null,
        billingStatus: null,
        publicGuideRetentionLabel: null,
        scheduledPlanChange: null,
        guideSelection: {
          status: "awaiting",
          limits: { custom: 2, adapted: 2, combined: 4 },
          selectedIds: [],
          guides: [
            {
              id: "c1",
              title: "Custom one",
              kind: "custom",
              kindLabel: "Custom guide",
              publicationLabel: "Published",
              updatedLabel: "1 October 2026",
            },
          ],
        },
        identity: null,
      },
    } as unknown as Awaited<ReturnType<typeof loadBillingPageContext>>);

    const html = renderToStaticMarkup(await BillingStatusPage());

    expect(html).toContain("max-w-5xl");
    expect(html).toContain("min-w-0");
    expect(html).toContain("w-full");
    expect(html).not.toContain("overflow-x");
    expect(html).toContain("billingSummaryGrid");
    expect(html).toContain(">Price<");
    expect(html).toContain("A$119 / month");
    expect(html).toContain("billingSummaryActions");
    expect(html).toContain("md:grid-cols-2");
    expect(html).toContain("Practice → Essential");
    expect(html).toContain("Custom one");
    expect(html).toContain(
      'class="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-6"'
    );

    const frameEnd = html.indexOf("max-w-5xl");
    const summary = html.indexOf("billingSummaryGrid");
    const selection = html.indexOf("Practice → Essential");
    expect(frameEnd).toBeGreaterThan(-1);
    expect(summary).toBeGreaterThan(frameEnd);
    expect(selection).toBeGreaterThan(summary);

    const actions = html.indexOf("billingSummaryActions");
    const contact = html.indexOf("Contact River Aftercare");
    const dashboard = html.indexOf(">Go to dashboard<");
    expect(actions).toBeGreaterThan(-1);
    expect(contact).toBeGreaterThan(actions);
    expect(dashboard).toBeGreaterThan(contact);
    expect(html).not.toContain(">Continue<");
    expect(html).toContain(
      'class="staffBtn staffBtnSecondary inline-flex h-11 w-full items-center sm:w-auto"'
    );
    expect(html).toContain(
      'class="staffBtn staffBtnPrimary inline-flex h-11 w-full items-center sm:w-auto"'
    );
  });
});
