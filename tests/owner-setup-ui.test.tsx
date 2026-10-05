import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-staff-session", () => ({
  requireStaffSession: vi.fn(),
}));

vi.mock("@/lib/clinic-portal/get-clinic-portal", () => ({
  getClinicPortalOverview: vi.fn(),
}));

vi.mock("@/lib/billing/notices/load", () => ({
  loadOverviewBillingNotices: vi.fn(),
}));

vi.mock("@/lib/clinic-portal/load-owner-setup", () => ({
  loadOwnerGettingStarted: vi.fn(),
}));

import ClinicOverviewPage from "@/app/(staff)/(clinic-portal)/dashboard/page";
import { GettingStarted } from "@/app/(staff)/(clinic-portal)/dashboard/getting-started";
import { requireStaffSession } from "@/lib/auth/require-staff-session";
import { loadOverviewBillingNotices } from "@/lib/billing/notices/load";
import { getClinicPortalOverview } from "@/lib/clinic-portal/get-clinic-portal";
import { loadOwnerGettingStarted } from "@/lib/clinic-portal/load-owner-setup";
import {
  deriveOwnerSetup,
  type OwnerSetupInput,
} from "@/lib/clinic-portal/owner-setup";

const overview = {
  clinicId: "clinic_1",
  clinicName: "Harbour Dental",
  displayName: "Harbour Dental",
  slug: "harbour-dental",
  patientSiteHref: "http://harbour-dental.localhost:3000/",
  publishedGuideCount: 0,
  draftGuideCount: 0,
  assistedOnboarding: false,
  setup: [
    {
      id: "identity",
      label: "Clinic identity",
      state: "needs_attention" as const,
      detail: "Add a patient-facing name and logo.",
    },
  ],
};

function freshInput(audience: OwnerSetupInput["audience"]): OwnerSetupInput {
  return {
    audience,
    profile: {
      displayName: "Harbour Dental",
      logoUrl: null,
      primaryColor: null,
      accentColor: null,
      themeMode: "SYSTEM",
      phone: null,
      contactUrl: null,
      emergencyInstructions: null,
      publishedGuideCount: 0,
    },
    serviceCategories: ["DENTAL"],
    sitesHref: "/practice/sites/site_1",
    templates: [
      {
        id: "tpl_dental",
        title: "Tooth extraction care",
        serviceCategory: "DENTAL",
        alreadyAdded: false,
      },
    ],
    guides: [],
    customGuidePermitted: true,
  };
}

describe("getting started surface", () => {
  beforeEach(() => {
    vi.mocked(requireStaffSession).mockReset();
    vi.mocked(getClinicPortalOverview).mockReset();
    vi.mocked(loadOverviewBillingNotices).mockReset();
    vi.mocked(loadOwnerGettingStarted).mockReset();
    vi.mocked(loadOverviewBillingNotices).mockResolvedValue([]);
  });

  it("renders administrator actions and the matching template", () => {
    const html = renderToStaticMarkup(
      <GettingStarted summary={deriveOwnerSetup(freshInput("admin"))} />
    );
    expect(html).toContain('data-owner-setup="getting-started"');
    expect(html).toContain("Getting started");
    expect(html).toContain("Complete Practice details");
    expect(html).toContain('href="/practice#practice-identity"');
    expect(html).toContain("Review templates");
    expect(html).toContain('href="/guides/new"');
    expect(html).toContain("Tooth extraction care");
    expect(html).toContain('data-template-category="DENTAL"');
    expect(html).not.toContain("Enable");
    expect(html).not.toMatch(/authori[sz]e payment/i);
  });

  it("states an empty category without offering a template", () => {
    const html = renderToStaticMarkup(
      <GettingStarted
        summary={deriveOwnerSetup({
          ...freshInput("admin"),
          serviceCategories: ["CHIROPRACTIC"],
          templates: [],
        })}
      />
    );
    expect(html).toContain('data-empty-category="CHIROPRACTIC"');
    expect(html).toContain(
      "No published template is available for Chiropractic."
    );
    expect(html).toContain("Create a custom guide");
    expect(html).toContain('href="/guides/new#custom-guide"');
    expect(html).not.toContain("data-template=");
  });

  it("renders the summary for staff without actionable setup links", () => {
    const html = renderToStaticMarkup(
      <GettingStarted summary={deriveOwnerSetup(freshInput("staff"))} />
    );
    expect(html).toContain("Getting started");
    expect(html).toContain("Needs attention");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("Complete Practice details");
  });

  it("leaves a historical clinic on the existing setup checklist", async () => {
    vi.mocked(getClinicPortalOverview).mockResolvedValue(overview);
    vi.mocked(requireStaffSession).mockResolvedValue({
      user: { id: "user_admin" },
      clinicMembership: {
        clinic: { id: "clinic_1", name: "Harbour Dental" },
        role: "ADMIN",
        source: "membership",
      },
    } as Awaited<ReturnType<typeof requireStaffSession>>);

    const html = renderToStaticMarkup(await ClinicOverviewPage());
    expect(html).toContain("Clinic setup");
    expect(html).toContain("Clinic identity");
    expect(html).not.toContain('data-owner-setup="getting-started"');
    expect(html).toContain("Published guides");
    expect(loadOwnerGettingStarted).not.toHaveBeenCalled();
  });

  it("shows getting started to an assisted administrator and keeps the guide summary", async () => {
    vi.mocked(getClinicPortalOverview).mockResolvedValue({
      ...overview,
      assistedOnboarding: true,
    });
    vi.mocked(requireStaffSession).mockResolvedValue({
      user: { id: "user_admin" },
      clinicMembership: {
        clinic: { id: "clinic_1", name: "Harbour Dental" },
        role: "ADMIN",
        source: "membership",
      },
    } as Awaited<ReturnType<typeof requireStaffSession>>);
    vi.mocked(loadOwnerGettingStarted).mockImplementation(
      async (_clinicId, audience) => deriveOwnerSetup(freshInput(audience))
    );

    const html = renderToStaticMarkup(await ClinicOverviewPage());
    expect(loadOwnerGettingStarted).toHaveBeenCalledWith("clinic_1", "admin");
    expect(html).toContain('data-owner-setup="getting-started"');
    expect(html).toContain("Complete Practice details");
    expect(html).not.toContain("Clinic setup");
    expect(html).toContain("Published guides");
    expect(html).toContain("Draft guides");
  });

  it("asks the loader for a staff audience on an assisted clinic", async () => {
    vi.mocked(getClinicPortalOverview).mockResolvedValue({
      ...overview,
      assistedOnboarding: true,
    });
    vi.mocked(requireStaffSession).mockResolvedValue({
      user: { id: "user_staff" },
      clinicMembership: {
        clinic: { id: "clinic_1", name: "Harbour Dental" },
        role: "STAFF",
        source: "membership",
      },
    } as Awaited<ReturnType<typeof requireStaffSession>>);
    vi.mocked(loadOwnerGettingStarted).mockImplementation(
      async (_clinicId, audience) => deriveOwnerSetup(freshInput(audience))
    );

    const html = renderToStaticMarkup(await ClinicOverviewPage());
    expect(loadOwnerGettingStarted).toHaveBeenCalledWith("clinic_1", "staff");
    expect(html).toContain("Getting started");
    expect(html).toContain("View patient site");
    expect(html).not.toContain("data-setup-action");
    expect(html).not.toContain("Complete Practice details");
  });
});
