import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { getPublishedPracticeGuide, listPublishedLocationGuides, notFound } =
  vi.hoisted(() => ({
    getPublishedPracticeGuide: vi.fn(),
    listPublishedLocationGuides: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    }),
  }));

vi.mock("@/lib/aftercare/get-published-practice-guide", () => ({
  getPublishedPracticeGuide,
}));

vi.mock("@/lib/aftercare/list-published-location-guides", () => ({
  listPublishedLocationGuides,
}));

vi.mock("next/navigation", () => ({
  notFound,
}));

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "demodental.localhost:3000",
      "x-forwarded-proto": "http",
    }),
}));

import TenantGuidePage, {
  generateMetadata,
} from "@/app/(aftercare)/%5Fsites/[tenant]/[guideSlug]/page";

const PUBLISHED_AT = new Date("2026-08-31T00:00:00.000Z");

const PROFILE_A = {
  displayName: "Riverside Dental Demo",
  logoUrl: "/demo/riverside-mark.svg",
  primaryColor: "#0f766e",
  accentColor: "#f59e0b",
  phone: "02 5550 0100",
  addressLine1: "12 Riverside Demo Street",
  addressLine2: null,
  city: "Sydney",
  region: "NSW",
  postalCode: "2000",
  country: "AU",
  bookingUrl: "https://www.example.com/riverside-dental-demo/book",
  contactUrl: "https://www.example.com/riverside-dental-demo/contact",
  contactEmail: "hello@riverside-dental-demo.example",
  emergencyInstructions: "DEMO: call the clinic or emergency services.",
  showCareGuideAttribution: true,
  instructionTerminology: "POST_TREATMENT",
  themeMode: "SYSTEM",
  allowPatientThemeToggle: true,
  typeface: null,
};

const GUIDE_A = {
  clinic: {
    id: "clinic_demo_rivers",
    slug: "demodental",
    name: "Rivers Care Demo Clinic",
  },
  profile: PROFILE_A,
  title: "Tooth Extraction",
  template: {
    id: "guide_tmpl_demo_extraction",
    slug: "extraction",
    title: "Tooth Extraction",
    specialty: "DENTAL",
  },
  practiceGuide: {
    id: "practice_guide_demo_rivers_extraction",
    publicSlug: "extraction",
    publishedAt: PUBLISHED_AT,
  },
  revision: {
    id: "guide_rev_demo_extraction_v1",
    version: 1,
    reviewedAt: PUBLISHED_AT,
  },
  sections: [
    {
      key: "introduction",
      kind: "INTRODUCTION" as const,
      title: "About this demo guide",
      body: "Canonical intro for Riverside patients.",
      periodLabel: null,
      provenance: "canonical" as const,
    },
    {
      key: "first-24-hours",
      kind: "FIRST_24_HOURS" as const,
      title: "The first day at Riverside Dental Demo",
      body: "Practice override: use the demo after-hours number.",
      periodLabel: "Today / first 24 hours",
      provenance: "practice_override" as const,
    },
    {
      key: "warning-signs",
      kind: "WARNING_SIGNS" as const,
      title: "Warning signs (demo)",
      body: "Canonical warning copy. Do not treat this as medical guidance.",
      periodLabel: null,
      provenance: "canonical" as const,
    },
    {
      key: "emergency",
      kind: "EMERGENCY" as const,
      title: "When this is urgent (demo)",
      body: "Canonical emergency context for the condition.",
      periodLabel: null,
      provenance: "canonical" as const,
    },
    {
      key: "weekend-contact",
      kind: "CUSTOM" as const,
      title: "Weekend contact (Riverside demo)",
      body: "Practice addition: local weekend information.",
      periodLabel: null,
      provenance: "practice_addition" as const,
    },
  ],
};

const GUIDE_B = {
  ...GUIDE_A,
  clinic: {
    id: "clinic_b",
    slug: "otherclinic",
    name: "Other Clinic",
  },
  profile: {
    ...PROFILE_A,
    displayName: "Other Clinic Patient Brand",
    phone: "555-0199",
    bookingUrl: "https://other.example.test/book",
    emergencyInstructions: "Other clinic emergency copy.",
    showCareGuideAttribution: false,
    logoUrl: null,
  },
  sections: [
    {
      key: "introduction",
      kind: "INTRODUCTION" as const,
      title: "Other clinic intro",
      body: "Tenant B canonical intro.",
      periodLabel: null,
      provenance: "canonical" as const,
    },
    {
      key: "first-24-hours",
      kind: "FIRST_24_HOURS" as const,
      title: "Other clinic first day",
      body: "Tenant B override copy.",
      periodLabel: null,
      provenance: "practice_override" as const,
    },
  ],
};

async function renderGuide(tenant = "demodental", guideSlug = "extraction") {
  const element = await TenantGuidePage({
    params: Promise.resolve({ tenant, guideSlug }),
  });
  return renderToStaticMarkup(element);
}

function headingTags(html: string): string[] {
  return [...html.matchAll(/<(h[1-6])\b/gi)].map((match) =>
    match[1].toLowerCase()
  );
}

describe("tenant guide page", () => {
  beforeEach(() => {
    getPublishedPracticeGuide.mockReset();
    listPublishedLocationGuides.mockReset();
    listPublishedLocationGuides.mockResolvedValue(null);
    notFound.mockClear();
  });

  it("renders composed guide content without internal provenance labels", async () => {
    getPublishedPracticeGuide.mockResolvedValue(GUIDE_A);

    const html = await renderGuide();

    expect(html).toContain("Tooth Extraction");
    expect(html).toContain("Post-treatment instructions");
    expect(html).not.toContain("Tooth Extraction — Tooth Extraction");
    expect(html).toContain("Canonical intro for Riverside patients.");
    expect(html).toContain("The first day at Riverside Dental Demo");
    expect(html).toContain(
      "Practice override: use the demo after-hours number."
    );
    expect(html).toContain("Weekend contact (Riverside demo)");
    expect(html).toContain("Practice addition: local weekend information.");
    expect(html).toContain("Warning signs (demo)");
    expect(html).toContain("When this is urgent (demo)");
    expect(html).toContain("Important. ");
    expect(html).toContain("Urgent. ");
    expect(html).toContain("Canonical emergency context for the condition.");
    expect(html).toContain("DEMO: call the clinic or emergency services.");
    expect(html).toContain('href="tel:0255500100"');
    expect(html).toContain("Call Riverside Dental Demo");
    expect(html).not.toContain("Book an appointment");
    expect(html).toContain("Interactive demo");
    expect(html).toContain("Sample content only");
    expect(html).toContain("Not clinical advice");
    expect(html).toContain('role="tablist"');
    expect(html).toContain("Today");
    expect(html).toContain("Timeline");
    expect(html).toContain("Print / Save PDF");
    expect(html).not.toContain("Check-in");
    expect(html).not.toContain("How are you feeling today?");
    expect(html).toContain("Powered by River Aftercare");
    expect(html).not.toContain("practice_override");
    expect(html).not.toContain("practice_addition");
    expect(html).not.toContain("login");
    expect(html).not.toContain("Sign in");
    expect(html).not.toContain("/_sites/");
    expect(html).not.toContain("Clinical review confirmed");
    expect(html).not.toContain("reviewedBy");
    expect(html).not.toContain("MedicalWebPage");
    expect(html).not.toContain("reviewAttested");
    expect(html).not.toContain("About this guide");
    expect(html).not.toContain("This aftercare information is provided by");
  });

  it("keeps clinic emergency chrome distinct from guide emergency content", async () => {
    getPublishedPracticeGuide.mockResolvedValue(GUIDE_A);

    const html = await renderGuide();

    expect(html).toContain("When this is urgent (demo)");
    expect(html).toContain("Canonical emergency context for the condition.");
    expect(html).toContain("If you need urgent help");
    expect(html).toContain("Contact Riverside Dental Demo");
    expect(html.indexOf("When this is urgent (demo)")).toBeLessThan(
      html.indexOf("If you need urgent help")
    );
  });

  it("does not leak tenant A copy onto tenant B", async () => {
    getPublishedPracticeGuide.mockResolvedValue(GUIDE_B);

    const html = await renderGuide("otherclinic");

    expect(html).toContain("Other Clinic Patient Brand");
    expect(html).toContain("Other clinic intro");
    expect(html).toContain("Tenant B override copy.");
    expect(html).toContain("Other clinic emergency copy.");
    expect(html).toContain('href="tel:5550199"');
    expect(html).not.toContain("Riverside Dental Demo");
    expect(html).not.toContain("Canonical intro for Riverside patients.");
    expect(html).not.toContain(
      "Practice override: use the demo after-hours number."
    );
    expect(html).not.toContain("Weekend contact (Riverside demo)");
    expect(html).not.toContain("Powered by River Aftercare");
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain("Check-in");
    expect(html).toContain("About this guide");
    expect(html).toContain(
      "This aftercare information is provided by Other Clinic Patient Brand for its patients. It does not replace advice from your treating practitioner. Follow any instructions given directly to you by your practitioner. If you are unsure about your recovery or need help, contact the practice using the details below."
    );
    expect(html.indexOf("Tenant B override copy.")).toBeLessThan(
      html.indexOf("About this guide")
    );
    expect(html.indexOf("About this guide")).toBeLessThan(
      html.indexOf("Contact Other Clinic Patient Brand")
    );
    expect(html).not.toContain("reviewedBy");
    expect(html).not.toContain("reviewAttestedBy");
    expect(html).not.toContain("MedicalWebPage");
    expect(html).not.toContain("Interactive demo");
    expect(html).not.toContain("Sample content only");
  });

  it("uses one h1, sequential headings, and a main landmark", async () => {
    getPublishedPracticeGuide.mockResolvedValue(GUIDE_A);

    const html = await renderGuide();
    const headings = headingTags(html);

    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain("<main");
    expect(headings[0]).toBe("h1");
    expect(headings.slice(1).every((tag) => tag !== "h1")).toBe(true);
    expect(headings).toContain("h2");
    expect(html).toContain('href="tel:0255500100"');
  });

  it("returns guide metadata with a public canonical URL", async () => {
    getPublishedPracticeGuide.mockResolvedValue(GUIDE_A);

    const metadata = await generateMetadata({
      params: Promise.resolve({
        tenant: "demodental",
        guideSlug: "extraction",
      }),
    });

    expect(metadata.title).toBe(
      "Tooth Extraction Post-treatment | Riverside Dental Demo"
    );
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.canonical).toBe(
      "http://demodental.localhost:3000/extraction"
    );
    expect(metadata.openGraph?.url).toBe(
      "http://demodental.localhost:3000/extraction"
    );
    expect(JSON.stringify(metadata)).not.toContain("/_sites");
    expect(JSON.stringify(metadata)).not.toContain("MedicalWebPage");
    expect(JSON.stringify(metadata)).not.toContain("reviewedBy");
  });

  it("points patient guide metadata at the clinic favicon when configured", async () => {
    getPublishedPracticeGuide.mockResolvedValue({
      ...GUIDE_A,
      profile: {
        ...PROFILE_A,
        faviconUrl:
          "clinics/clinic_demo_rivers/branding/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png",
      },
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({
        tenant: "demodental",
        guideSlug: "extraction",
      }),
    });

    expect(JSON.stringify(metadata.icons)).toContain(
      "/clinic-branding/clinic_demo_rivers/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png"
    );
    expect(JSON.stringify(metadata.icons)).not.toContain("clinic_b");
  });

  it("renders a heading when a composed section has an empty body", async () => {
    getPublishedPracticeGuide.mockResolvedValue({
      ...GUIDE_A,
      sections: [
        {
          key: "empty-body",
          kind: "INTRODUCTION" as const,
          title: "Empty body section",
          body: "   \n\n",
          periodLabel: null,
          provenance: "canonical" as const,
        },
      ],
    });

    const html = await renderGuide();

    expect(html).toContain("Empty body section");
    expect(html).toContain("<h2");
    expect(html).not.toContain("Canonical intro for Riverside patients.");
  });

  it("omits the contact follow-up when a real clinic publishes without contact details", async () => {
    getPublishedPracticeGuide.mockResolvedValue({
      ...GUIDE_B,
      profile: {
        ...GUIDE_B.profile,
        phone: null,
        contactUrl: null,
        emergencyInstructions: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        region: null,
        postalCode: null,
      },
    });

    const html = await renderGuide("otherclinic");

    expect(html).toContain("About this guide");
    expect(html).toContain(
      "This aftercare information is provided by Other Clinic Patient Brand for its patients. It does not replace advice from your treating practitioner. Follow any instructions given directly to you by your practitioner."
    );
    expect(html).not.toContain(
      "If you are unsure about your recovery or need help, contact the practice using the details below."
    );
    expect(html).not.toContain("Contact Other Clinic Patient Brand");
    expect(html).not.toContain("reviewedBy");
    expect(html).not.toContain("MedicalWebPage");
  });

  it("returns not-found behaviour for unknown, draft, or disabled guides", async () => {
    getPublishedPracticeGuide.mockResolvedValue(null);

    await expect(renderGuide("demodental", "draft-guide")).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404"
    );
    expect(notFound).toHaveBeenCalledOnce();
    expect(getPublishedPracticeGuide).toHaveBeenCalledWith({
      clinicSlug: "demodental",
      publicSlug: "draft-guide",
    });
  });
});
