import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.hoisted(() => vi.fn());
const getAuthContextMock = vi.hoisted(() => vi.fn());
const settingsFindUnique = vi.hoisted(() => vi.fn());
const pageFindUnique = vi.hoisted(() => vi.fn());
const settingsUpsert = vi.hoisted(() => vi.fn());
const pagesUpsert = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getAuthContext: getAuthContextMock,
  isPlatformOperator: (user: { platformRole?: string } | null | undefined) =>
    user?.platformRole === "OPERATOR",
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    platformSeoSettings: { findUnique: settingsFindUnique },
    marketingPageSeo: { findUnique: pageFindUnique },
    $transaction: async (fn: (tx: unknown) => Promise<void>) =>
      fn({
        platformSeoSettings: { upsert: settingsUpsert },
        marketingPageSeo: { upsert: pagesUpsert },
      }),
  }),
}));

import { savePlatformSeoAction } from "@/app/(staff)/(operator)/operator/seo/actions";
import { marketingConfiguredPublicLinks } from "@/lib/marketing/configured-public-links";
import {
  isPatientOrStaffRevalidatePath,
  MARKETING_DELIVERY_PATHS,
  marketingDeliveryPath,
} from "@/lib/marketing/revalidate-marketing";
import { marketingPageSeoFields } from "@/lib/seo/defaults";
import { generateMarketingMetadata } from "@/lib/seo/marketing-page";
import { MARKETING_SEO_PAGE_KEYS } from "@/lib/seo/page-keys";
import { MARKETING_SEO_PATHS } from "@/lib/seo/types";

const CONTENT_PAGES = [
  "app/(marketing)/%5Fmarketing/page.tsx",
  "app/(marketing)/%5Fmarketing/pricing/page.tsx",
  "app/(marketing)/%5Fmarketing/contact/page.tsx",
  "app/(marketing)/%5Fmarketing/about/page.tsx",
  "app/(marketing)/%5Fmarketing/privacy/page.tsx",
  "app/(marketing)/%5Fmarketing/terms/page.tsx",
  "app/(marketing)/%5Fmarketing/clinics/page.tsx",
  "app/(marketing)/%5Fmarketing/dental/page.tsx",
  "app/(marketing)/%5Fmarketing/physiotherapy/page.tsx",
  "app/(marketing)/%5Fmarketing/chiropractic/page.tsx",
  "app/(marketing)/%5Fmarketing/cosmetic-clinics/page.tsx",
] as const;

function seoFormData(): FormData {
  const data = new FormData();
  data.set("siteName", "River Aftercare");
  data.set("defaultDescription", "Branded aftercare pages for clinics.");
  data.set("organizationName", "River Aftercare");
  data.set(
    "organizationDescription",
    "River Aftercare publishes branded patient aftercare."
  );
  data.set("publicContactEmail", "");
  data.set("sameAsUrls", "");
  for (const path of MARKETING_SEO_PATHS) {
    const key = MARKETING_SEO_PAGE_KEYS[path];
    const fields = marketingPageSeoFields(path);
    data.set(`${key}SeoTitle`, fields.seoTitle);
    data.set(`${key}MetaDescription`, fields.metaDescription);
    data.set(`${key}OgTitle`, fields.ogTitle ?? "");
    data.set(`${key}OgDescription`, fields.ogDescription ?? "");
    data.set(`${key}OgImagePath`, fields.ogImagePath ?? "");
    if (fields.index) {
      data.set(`${key}Index`, "on");
    }
    if (fields.follow) {
      data.set(`${key}Follow`, "on");
    }
  }
  return data;
}

describe("marketing static delivery", () => {
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;
  const previousBase = process.env.CARE_GUIDE_METADATA_BASE;

  beforeEach(() => {
    revalidatePathMock.mockReset();
    getAuthContextMock.mockReset();
    settingsFindUnique.mockReset();
    pageFindUnique.mockReset();
    settingsUpsert.mockReset();
    pagesUpsert.mockReset();
    settingsUpsert.mockResolvedValue({});
    pagesUpsert.mockResolvedValue({});
    settingsFindUnique.mockResolvedValue(null);
    pageFindUnique.mockResolvedValue(null);
    delete process.env.CARE_GUIDE_METADATA_BASE;
  });

  afterEach(() => {
    if (previousRoot === undefined) {
      delete process.env.CARE_GUIDE_ROOT_DOMAIN;
    } else {
      process.env.CARE_GUIDE_ROOT_DOMAIN = previousRoot;
    }
    if (previousBase === undefined) {
      delete process.env.CARE_GUIDE_METADATA_BASE;
    } else {
      process.env.CARE_GUIDE_METADATA_BASE = previousBase;
    }
  });

  it("builds production marketing links from configuration", () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "riveraftercare.com.au";
    const links = marketingConfiguredPublicLinks();
    expect(links.homeHref).toBe("https://riveraftercare.com.au/");
    expect(links.demoHref).toBe("https://demodental.riveraftercare.com.au/");
    expect(links.staffHref).toBe("https://app.riveraftercare.com.au/login");
    expect(links.demoHref).not.toContain("localhost");
    expect(JSON.stringify(links)).not.toMatch(/clinicSite|session|locationId/i);
  });

  it("keeps the local dev port on configured marketing links", () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    const links = marketingConfiguredPublicLinks();
    expect(links.homeHref).toBe("http://localhost:3000/");
    expect(links.demoHref).toBe("http://demodental.localhost:3000/");
    expect(links.staffHref).toBe("http://app.localhost:3000/login");
  });

  it("honours an explicit metadata origin port", () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    process.env.CARE_GUIDE_METADATA_BASE = "http://localhost:4000";
    const links = marketingConfiguredPublicLinks();
    expect(links.homeHref).toBe("http://localhost:4000/");
    expect(links.staffHref).toBe("http://app.localhost:4000/login");
  });

  it("does not read request headers or tenant records for marketing links", () => {
    const source = readFileSync(
      "lib/marketing/configured-public-links.ts",
      "utf8"
    );
    expect(source).not.toContain('from "next/headers"');
    expect(source).not.toContain("cookies(");
    expect(source).not.toContain("getPrisma");
    expect(source).not.toContain("ClinicSite");
    expect(source).not.toMatch(/\bawait headers\(/);
  });

  it("keeps request-host links on staff surfaces", () => {
    const staff = readFileSync("lib/marketing/public-links.ts", "utf8");
    const shell = readFileSync(
      "app/(staff)/components/staff-auth-shell.tsx",
      "utf8"
    );
    expect(staff).toContain('from "next/headers"');
    expect(staff).toContain("headers()");
    expect(shell).toContain("marketingPublicLinks");
    expect(shell).not.toContain("marketingConfiguredPublicLinks");
  });

  it("prerenders marketing content pages without request headers", () => {
    for (const file of CONTENT_PAGES) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain('export const dynamic = "error"');
      expect(source, file).toContain("marketingConfiguredPublicLinks");
      expect(source, file).toContain("generateMarketingMetadata");
      expect(source, file).toContain("loadMarketingJsonLd");
      expect(source, file).not.toContain("marketingPublicLinks");
      expect(source, file).not.toContain("headers(");
      expect(source, file).not.toContain("cookies(");
      expect(source, file).not.toContain("getAuthContext");
      expect(source, file).not.toContain("ClinicSite");
      expect(source, file).not.toContain("getClinicBySlug");
    }
  });

  it("leaves the unknown-path catch-all and tenant layout dynamic", () => {
    const unmatched = readFileSync(
      "app/(marketing)/%5Fmarketing/[...slug]/page.tsx",
      "utf8"
    );
    const tenant = readFileSync(
      "app/(aftercare)/%5Fsites/[tenant]/layout.tsx",
      "utf8"
    );
    expect(unmatched).not.toContain('dynamic = "error"');
    expect(unmatched).not.toContain("marketingConfiguredPublicLinks");
    expect(unmatched).toContain("notFound()");
    expect(tenant).toContain('export const dynamic = "force-dynamic"');
  });

  it("maps public marketing URLs to proxy destination routes", () => {
    expect(marketingDeliveryPath("/")).toBe("/_marketing");
    expect(marketingDeliveryPath("/pricing")).toBe("/_marketing/pricing");
    expect(MARKETING_DELIVERY_PATHS).toEqual(
      MARKETING_SEO_PATHS.map(marketingDeliveryPath)
    );
    expect(
      MARKETING_DELIVERY_PATHS.some((path) =>
        isPatientOrStaffRevalidatePath(path)
      )
    ).toBe(false);
    expect(
      MARKETING_DELIVERY_PATHS.some((path) => path.startsWith("/_sites"))
    ).toBe(false);
  });

  it("reflects operator SEO rows in metadata and canonical URLs", async () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "riveraftercare.com.au";
    settingsFindUnique.mockResolvedValue({
      siteName: "River Aftercare",
      defaultDescription: "Operator default description for clinics.",
      organizationName: "River Aftercare",
      organizationDescription: "Operator organization description.",
      publicContactEmail: "hello@riveraftercare.com.au",
      defaultOgImagePath: null,
      sameAsUrls: [],
      updatedAt: new Date("2026-09-25T00:00:00.000Z"),
    });
    pageFindUnique.mockResolvedValue({
      path: "/pricing",
      seoTitle: "Operator pricing title",
      metaDescription: "Operator pricing description for clinics.",
      ogTitle: "Operator pricing share title",
      ogDescription: "Operator pricing share description.",
      ogImagePath: null,
      index: true,
      follow: true,
      updatedAt: new Date("2026-09-25T00:00:00.000Z"),
    });

    const metadata = await generateMarketingMetadata("/pricing");
    expect(metadata.title).toEqual({
      absolute: "Operator pricing title — River Aftercare",
    });
    expect(metadata.description).toBe(
      "Operator pricing description for clinics."
    );
    expect(metadata.alternates?.canonical).toBe(
      "https://riveraftercare.com.au/pricing"
    );
    expect(metadata.openGraph).toMatchObject({
      url: "https://riveraftercare.com.au/pricing",
      title: "Operator pricing share title",
      description: "Operator pricing share description.",
    });
    expect(JSON.stringify(metadata.twitter)).toContain('"card":"summary"');
    expect(JSON.stringify(metadata)).not.toContain("ClinicSite");
    expect(JSON.stringify(metadata)).not.toContain("demodental");
  });

  it("revalidates marketing destinations after a successful operator save", async () => {
    getAuthContextMock.mockResolvedValue({
      user: {
        id: "user_operator",
        email: "operator@care-guide.test",
        name: "Demo Operator",
        platformRole: "OPERATOR",
      },
      clinicMembership: null,
    });

    const result = await savePlatformSeoAction({}, seoFormData());
    expect(result.success).toBe("SEO & Discovery settings saved.");
    for (const path of MARKETING_DELIVERY_PATHS) {
      expect(revalidatePathMock).toHaveBeenCalledWith(path);
    }
    expect(revalidatePathMock).toHaveBeenCalledWith("/sitemap.xml");
    expect(revalidatePathMock).toHaveBeenCalledWith("/llms.txt");
    expect(revalidatePathMock).toHaveBeenCalledWith("/operator/seo");
    const invalidated = revalidatePathMock.mock.calls.map((call) =>
      String(call[0])
    );
    expect(invalidated).not.toContain("/");
    expect(invalidated.some((path) => path.startsWith("/_sites"))).toBe(false);
    expect(
      invalidated.some((path) => isPatientOrStaffRevalidatePath(path))
    ).toBe(false);
    expect(invalidated).not.toContain("/pricing");
    expect(invalidated).not.toContain("/login");
  });

  it("does not revalidate when the operator save is rejected", async () => {
    getAuthContextMock.mockResolvedValue({
      user: null,
      clinicMembership: null,
    });
    await expect(savePlatformSeoAction({}, seoFormData())).rejects.toThrow(
      "NEXT_REDIRECT"
    );
    expect(revalidatePathMock).not.toHaveBeenCalled();

    getAuthContextMock.mockResolvedValue({
      user: {
        id: "user_operator",
        email: "operator@care-guide.test",
        name: "Demo Operator",
        platformRole: "OPERATOR",
      },
      clinicMembership: null,
    });
    const invalid = seoFormData();
    invalid.set("siteName", "");
    const rejected = await savePlatformSeoAction({}, invalid);
    expect(rejected.error).toBeTruthy();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("keeps the contact form and Turnstile host check", () => {
    const page = readFileSync(
      "app/(marketing)/%5Fmarketing/contact/page.tsx",
      "utf8"
    );
    const form = readFileSync(
      "app/(marketing)/components/contact-form.tsx",
      "utf8"
    );
    const turnstile = readFileSync(
      "app/(marketing)/components/contact-turnstile.tsx",
      "utf8"
    );
    const action = readFileSync(
      "app/(marketing)/%5Fmarketing/contact/actions.ts",
      "utf8"
    );
    expect(page).toContain("ContactForm");
    expect(page).toContain("getTurnstileSiteKey");
    expect(form).toContain("ContactTurnstile");
    expect(form).toContain("submitMarketingContactAction");
    expect(turnstile).toContain("CONTACT_TURNSTILE_FIELD");
    expect(
      readFileSync("lib/marketing/contact-turnstile-public.ts", "utf8")
    ).toContain('CONTACT_TURNSTILE_FIELD = "cf-turnstile-response"');
    expect(action).toContain("headers()");
    expect(action).toContain("isMarketingContactHost");
    expect(action).toContain("verifyTurnstileToken");
  });
});
