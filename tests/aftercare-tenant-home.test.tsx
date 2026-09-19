import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { listPublishedPracticeGuides, notFound } = vi.hoisted(() => ({
  listPublishedPracticeGuides: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
}));

vi.mock("@/lib/aftercare/list-published-practice-guides", () => ({
  listPublishedPracticeGuides,
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

import TenantHomePage, {
  generateMetadata,
} from "@/app/(aftercare)/%5Fsites/[tenant]/page";

const PUBLISHED_AT = new Date("2026-08-31T00:00:00.000Z");

const DEMODENTAL = {
  clinic: {
    id: "clinic_demo_rivers",
    slug: "demodental",
    name: "Rivers Care Demo Clinic",
  },
  profile: {
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
  },
  guides: [
    {
      id: "practice_guide_demo_rivers_extraction",
      publicSlug: "extraction",
      title: "Tooth Extraction",
      sortOrder: 1,
      publishedAt: PUBLISHED_AT,
    },
  ],
};

const OTHER_CLINIC = {
  clinic: {
    id: "clinic_b",
    slug: "otherclinic",
    name: "Other Clinic",
  },
  profile: {
    ...DEMODENTAL.profile,
    displayName: "Other Clinic Patient Brand",
    logoUrl: null,
    phone: "555-0199",
    bookingUrl: "https://other.example.test/book",
    contactUrl: null,
    emergencyInstructions: "Other clinic emergency copy.",
    showCareGuideAttribution: false,
  },
  guides: [
    {
      id: "pg_other",
      publicSlug: "extraction",
      title: "Other Clinic Extraction",
      sortOrder: 1,
      publishedAt: PUBLISHED_AT,
    },
  ],
};

async function renderHome(tenant = "demodental") {
  const element = await TenantHomePage({
    params: Promise.resolve({ tenant }),
  });
  return renderToStaticMarkup(element);
}

function headingTags(html: string): string[] {
  return [...html.matchAll(/<(h[1-6])\b/gi)].map((match) =>
    match[1].toLowerCase()
  );
}

describe("tenant homepage", () => {
  beforeEach(() => {
    listPublishedPracticeGuides.mockReset();
    notFound.mockClear();
  });

  it("renders the practice name, published guide, contact, and attribution", async () => {
    listPublishedPracticeGuides.mockResolvedValue(DEMODENTAL);

    const html = await renderHome();

    expect(html).toContain("Riverside Dental Demo");
    expect(html).toContain(">Post-treatment instructions<");
    expect(html).not.toContain(
      "Riverside Dental Demo — Post-treatment instructions</h1>"
    );
    expect(html).toContain("Tooth Extraction");
    expect(html).toContain('href="/extraction"');
    expect(html).toContain("View post-treatment instructions");
    expect(html).toContain('href="tel:0255500100"');
    expect(html).toContain("Call Riverside Dental Demo");
    expect(html).not.toContain(
      'href="https://www.example.com/riverside-dental-demo/book"'
    );
    expect(html).not.toContain("Book an appointment");
    expect(html).toContain("DEMO: call the clinic or emergency services.");
    expect(html).toContain("Powered by River Aftercare");
    expect(html).toContain("<footer");
    expect(html).not.toMatch(/River Aftercare pricing/i);
    expect(html).not.toContain("Contact River Aftercare");
    expect(html).not.toContain("Aftercare Guide");
    expect(html).toContain("Interactive demo");
    expect(html).toContain("Sample content only");
    expect(html).toContain("Not clinical advice");
    expect(html).toContain('src="/demo/riverside-mark.svg"');
    expect(html).not.toContain("Implant Aftercare");
    expect(html).not.toContain("login");
    expect(html).not.toContain("Sign in");
    expect(html).not.toContain("/_sites/");
  });

  it("omits unpublished or disabled guides that the loader did not return", async () => {
    listPublishedPracticeGuides.mockResolvedValue(DEMODENTAL);

    const html = await renderHome();

    expect(html).toContain("Tooth Extraction");
    expect(html).not.toContain("Draft Guide");
    expect(html).not.toContain("Disabled Guide");
  });

  it("omits optional contact fields and attribution when they are absent", async () => {
    listPublishedPracticeGuides.mockResolvedValue({
      ...DEMODENTAL,
      profile: {
        ...DEMODENTAL.profile,
        phone: null,
        bookingUrl: null,
        contactUrl: null,
        emergencyInstructions: null,
        showCareGuideAttribution: false,
        logoUrl: null,
      },
    });

    const html = await renderHome();

    expect(html).toContain("Riverside Dental Demo");
    expect(html).not.toContain("tel:");
    expect(html).not.toContain("Book an appointment");
    expect(html).not.toContain("If you need urgent help");
    expect(html).not.toContain("Powered by River Aftercare");
    expect(html).not.toContain("<footer");
    expect(html).not.toContain("<img");
  });

  it("renders an empty state when no published guides exist", async () => {
    listPublishedPracticeGuides.mockResolvedValue({
      ...DEMODENTAL,
      guides: [],
    });

    const html = await renderHome();

    expect(html).toContain("Riverside Dental Demo");
    expect(html).toContain(
      "No post-treatment instructions are published by this practice yet."
    );
    expect(html).not.toContain('href="/extraction"');
  });

  it("preserves loader sort order for published guides", async () => {
    listPublishedPracticeGuides.mockResolvedValue({
      ...DEMODENTAL,
      guides: [
        {
          id: "pg_a",
          publicSlug: "extraction",
          title: "Tooth Extraction",
          sortOrder: 1,
          publishedAt: PUBLISHED_AT,
        },
        {
          id: "pg_b",
          publicSlug: "implants",
          title: "Dental Implant",
          sortOrder: 2,
          publishedAt: PUBLISHED_AT,
        },
      ],
    });

    const html = await renderHome();
    expect(html.indexOf("Tooth Extraction")).toBeLessThan(
      html.indexOf("Dental Implant")
    );
    expect(html).toContain('href="/implants"');
  });

  it("does not leak tenant A identity onto tenant B", async () => {
    listPublishedPracticeGuides.mockResolvedValue(OTHER_CLINIC);

    const html = await renderHome("otherclinic");

    expect(html).toContain("Other Clinic Patient Brand");
    expect(html).toContain("Other Clinic Extraction");
    expect(html).toContain("Other clinic emergency copy.");
    expect(html).toContain('href="tel:5550199"');
    expect(html).not.toContain("Riverside Dental Demo");
    expect(html).not.toContain("02 5550 0100");
    expect(html).not.toContain("riverside-dental-demo");
    expect(html).not.toContain("Powered by River Aftercare");
    expect(html).not.toContain("Interactive demo");
  });

  it("uses one h1, a main landmark, and a tel action", async () => {
    listPublishedPracticeGuides.mockResolvedValue(DEMODENTAL);

    const html = await renderHome();

    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain("<main");
    expect(headingTags(html)[0]).toBe("h1");
    expect(html).toContain('href="tel:0255500100"');
    expect(html).toContain("Call Riverside Dental Demo");
    expect(html).toContain("Questions about your recovery?");
    expect(html).toContain('aria-label="Post-treatment instructions"');
  });

  it("returns tenant-aware noindex metadata with a public canonical URL", async () => {
    listPublishedPracticeGuides.mockResolvedValue(DEMODENTAL);

    const metadata = await generateMetadata({
      params: Promise.resolve({ tenant: "demodental" }),
    });

    expect(metadata.title).toBe(
      "Riverside Dental Demo — Post-treatment instructions"
    );
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.canonical).toBe(
      "http://demodental.localhost:3000/"
    );
    expect(JSON.stringify(metadata)).not.toContain("/_sites");
  });

  it("returns not-found behaviour for an unknown tenant", async () => {
    listPublishedPracticeGuides.mockResolvedValue(null);

    await expect(renderHome("unknown")).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404"
    );
    expect(notFound).toHaveBeenCalledOnce();
  });
});
