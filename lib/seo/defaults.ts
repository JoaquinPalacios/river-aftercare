import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { DRAFT_LEGAL_ROBOTS, INDEXABLE_ROBOTS } from "@/lib/seo/robots-policy";
import type {
  MarketingPageSeoInput,
  MarketingSeoPath,
  PlatformSeoIdentity,
} from "@/lib/seo/types";

export const DEFAULT_PLATFORM_SEO: PlatformSeoIdentity = {
  siteName: PRODUCT_NAME,
  defaultDescription:
    "Patient aftercare software for clinics and practices. Create branded treatment, recovery and home-care instructions patients can reopen by link or QR code.",
  organizationName: PRODUCT_NAME,
  organizationDescription: `${PRODUCT_NAME} is a digital patient aftercare platform for clinics and practices. Teams publish branded treatment, recovery and home-care instructions patients can reopen after an appointment by link or QR code, without an app or login.`,
  publicContactEmail: null,
  defaultOgImagePath: null,
  sameAsUrls: [],
  updatedAt: null,
};

/**
 * Code-owned marketing SEO defaults, including sitemap lastmod.
 *
 * `lastModified` is a calendar date (`YYYY-MM-DD`) of the last material
 * public-page content change for that route (copy, title/description,
 * structured sections, or other indexable SEO content). Sitemap lastmod
 * reads this field. Update it when those change. Do not set it to deploy,
 * build, or sitemap-generation time.
 */
export type MarketingPageSeoDefault = Omit<
  MarketingPageSeoInput,
  "path" | "updatedAt"
> & {
  lastModified: string;
};

export const DEFAULT_MARKETING_PAGE_SEO: Record<
  MarketingSeoPath,
  MarketingPageSeoDefault
> = {
  "/": {
    seoTitle: "Patient Aftercare Software for Clinics | River Aftercare",
    metaDescription:
      "Create branded treatment, recovery and home-care instructions patients can reopen by link or QR code. Built for modern clinics and practices.",
    ogTitle: "Aftercare that still feels like your clinic",
    ogDescription:
      "Give patients clear, branded guidance they can reopen after they leave—without an app or patient login.",
    ogImagePath: null,
    index: INDEXABLE_ROBOTS.index,
    follow: INDEXABLE_ROBOTS.follow,
    lastModified: "2026-09-17",
  },
  "/pricing": {
    seoTitle: "Patient Aftercare Software Pricing | River Aftercare",
    metaDescription: `Compare ${PRODUCT_NAME} plans for clinics and practices. Australian dollar prices include GST, from branded digital aftercare for a single location through to custom Group support.`,
    ogTitle: null,
    ogDescription: null,
    ogImagePath: null,
    index: INDEXABLE_ROBOTS.index,
    follow: INDEXABLE_ROBOTS.follow,
    lastModified: "2026-09-19",
  },
  "/contact": {
    seoTitle: "Book a Demo | River Aftercare",
    metaDescription: `See how ${PRODUCT_NAME} helps clinics and practices deliver branded treatment and recovery guidance patients can reopen after their appointment.`,
    ogTitle: null,
    ogDescription: null,
    ogImagePath: null,
    index: INDEXABLE_ROBOTS.index,
    follow: INDEXABLE_ROBOTS.follow,
    lastModified: "2026-09-16",
  },
  "/about": {
    seoTitle: "About River Aftercare | Digital Patient Aftercare",
    metaDescription: `${PRODUCT_NAME} helps clinics and practices deliver clear, branded treatment, recovery and home-care instructions after the appointment.`,
    ogTitle: null,
    ogDescription: null,
    ogImagePath: null,
    index: INDEXABLE_ROBOTS.index,
    follow: INDEXABLE_ROBOTS.follow,
    lastModified: "2026-09-16",
  },
  "/privacy": {
    seoTitle: "Privacy Policy",
    metaDescription: `How ${PRODUCT_NAME} handles personal information on the public website, clinic and staff accounts, business communications, and clinic-branded aftercare pages.`,
    ogTitle: null,
    ogDescription: null,
    ogImagePath: null,
    index: DRAFT_LEGAL_ROBOTS.index,
    follow: DRAFT_LEGAL_ROBOTS.follow,
    lastModified: "2026-09-19",
  },
  "/terms": {
    seoTitle: "Terms & Conditions",
    metaDescription: `Terms for using ${PRODUCT_NAME}, a B2B aftercare publishing platform for healthcare practices.`,
    ogTitle: null,
    ogDescription: null,
    ogImagePath: null,
    index: DRAFT_LEGAL_ROBOTS.index,
    follow: DRAFT_LEGAL_ROBOTS.follow,
    lastModified: "2026-09-19",
  },
  "/clinics": {
    seoTitle:
      "Patient Aftercare Software for Clinics & Practices | River Aftercare",
    metaDescription:
      "Explore River Aftercare for dental, physiotherapy, chiropractic and cosmetic clinics. One branded aftercare platform, adapted to different care workflows.",
    ogTitle: "Patient aftercare for different kinds of clinics",
    ogDescription:
      "See how River Aftercare adapts branded patient guidance to dental, physiotherapy, chiropractic and cosmetic clinic workflows.",
    ogImagePath: null,
    index: INDEXABLE_ROBOTS.index,
    follow: INDEXABLE_ROBOTS.follow,
    lastModified: "2026-09-17",
  },
  "/dental": {
    seoTitle: "Dental Aftercare Software for Practices | River Aftercare",
    metaDescription:
      "Give patients clear, clinic-branded post-treatment instructions they can reopen after dental treatment by link or QR code, with no app or patient login.",
    ogTitle: "Aftercare that still feels like your dental practice",
    ogDescription:
      "Give patients clear post-treatment guidance under your practice brand, with a page they can reopen whenever they need it.",
    ogImagePath: null,
    index: true,
    follow: true,
    lastModified: "2026-09-17",
  },
  "/physiotherapy": {
    seoTitle: "Physiotherapy Patient Aftercare Software | River Aftercare",
    metaDescription:
      "Share branded recovery, home-care and written exercise guidance patients can reopen between physiotherapy appointments by link or QR code.",
    ogTitle: "Recovery guidance that still feels like your clinic",
    ogDescription:
      "Give patients clear home-care and recovery guidance they can return to between physiotherapy appointments.",
    ogImagePath: null,
    index: true,
    follow: true,
    lastModified: "2026-09-17",
  },
  "/chiropractic": {
    seoTitle: "Chiropractic Patient Aftercare Software | River Aftercare",
    metaDescription:
      "Publish branded home-care and post-appointment guidance patients can reopen between chiropractic visits by link or QR code, with no app or login.",
    ogTitle: "Between-visit guidance that still feels like your practice",
    ogDescription:
      "Keep clinic-approved home-care and post-appointment guidance clear, branded and easy for patients to revisit.",
    ogImagePath: null,
    index: true,
    follow: true,
    lastModified: "2026-09-17",
  },
  "/cosmetic-clinics": {
    seoTitle: "Cosmetic Clinic Aftercare Software | River Aftercare",
    metaDescription:
      "Give clients clear, clinic-branded post-treatment aftercare they can reopen after cosmetic and aesthetic treatments by link or QR code.",
    ogTitle: "Post-treatment aftercare that stays under your clinic brand",
    ogDescription:
      "Extend the treatment experience with clear, branded aftercare clients can return to once they leave the clinic.",
    ogImagePath: null,
    index: true,
    follow: true,
    lastModified: "2026-09-17",
  },
};

export function marketingPageSeoFields(
  path: MarketingSeoPath
): Omit<MarketingPageSeoInput, "path" | "updatedAt"> {
  const { lastModified, ...fields } = DEFAULT_MARKETING_PAGE_SEO[path];
  void lastModified;
  return fields;
}

export const MARKETING_PAGE_LABELS: Record<MarketingSeoPath, string> = {
  "/": "Home",
  "/pricing": "Pricing",
  "/contact": "Contact",
  "/about": "About",
  "/privacy": "Privacy Policy",
  "/terms": "Terms & Conditions",
  "/clinics": "Clinics",
  "/dental": "Dental",
  "/physiotherapy": "Physiotherapy",
  "/chiropractic": "Chiropractic",
  "/cosmetic-clinics": "Cosmetic & aesthetic",
};

export const TITLE_GUIDE_LENGTH = 60;
export const TITLE_MAX_LENGTH = 120;
export const DESCRIPTION_GUIDE_LENGTH = 160;
export const DESCRIPTION_MAX_LENGTH = 320;
export const ORGANIZATION_DESCRIPTION_MAX_LENGTH = 400;
export const SITE_NAME_MAX_LENGTH = 80;
