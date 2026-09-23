import { PRODUCT_NAME } from "@/lib/branding/product-name";
import {
  PRIVACY_LAST_UPDATED_ISO,
  TERMS_LAST_UPDATED_ISO,
} from "@/lib/legal/status";
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
    metaDescription: `Compare ${PRODUCT_NAME} Essential and Practice plans for clinics. Australian dollar pricing for branded patient aftercare, from a single location through to custom Group support.`,
    ogTitle: null,
    ogDescription: null,
    ogImagePath: null,
    index: INDEXABLE_ROBOTS.index,
    follow: INDEXABLE_ROBOTS.follow,
    lastModified: "2026-09-20",
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
    lastModified: PRIVACY_LAST_UPDATED_ISO,
  },
  "/terms": {
    seoTitle: "Terms & Conditions",
    metaDescription: `Terms for using ${PRODUCT_NAME}, a B2B aftercare publishing platform for healthcare practices.`,
    ogTitle: null,
    ogDescription: null,
    ogImagePath: null,
    index: DRAFT_LEGAL_ROBOTS.index,
    follow: DRAFT_LEGAL_ROBOTS.follow,
    lastModified: TERMS_LAST_UPDATED_ISO,
  },
  "/clinics": {
    seoTitle: "Patient Aftercare for Treatment-Based Clinics | River Aftercare",
    metaDescription:
      "See how River Aftercare helps dental, physiotherapy, chiropractic and cosmetic clinics publish branded aftercare patients can revisit by link or QR code.",
    ogTitle: "Patient aftercare for treatment-based clinics",
    ogDescription:
      "See how River Aftercare helps dental, physiotherapy, chiropractic and cosmetic clinics publish branded aftercare patients can revisit by link or QR code.",
    ogImagePath: null,
    index: INDEXABLE_ROBOTS.index,
    follow: INDEXABLE_ROBOTS.follow,
    lastModified: "2026-09-21",
  },
  "/dental": {
    seoTitle: "Dental Aftercare Software for Practices | River Aftercare",
    metaDescription:
      "Publish branded dental post-treatment instructions patients can revisit by link or QR code. No patient app or login required.",
    ogTitle: "Dental Aftercare Software for Practices | River Aftercare",
    ogDescription:
      "Publish branded dental post-treatment instructions patients can revisit by link or QR code. No patient app or login required.",
    ogImagePath: null,
    index: true,
    follow: true,
    lastModified: "2026-09-21",
  },
  "/physiotherapy": {
    seoTitle: "Physiotherapy Aftercare Software for Clinics | River Aftercare",
    metaDescription:
      "Publish branded physiotherapy recovery and home-care guidance patients can revisit between appointments by link or QR code. No patient app or login required.",
    ogTitle: "Physiotherapy Aftercare Software for Clinics | River Aftercare",
    ogDescription:
      "Publish branded physiotherapy recovery and home-care guidance patients can revisit between appointments by link or QR code. No patient app or login required.",
    ogImagePath: null,
    index: true,
    follow: true,
    lastModified: "2026-09-21",
  },
  "/chiropractic": {
    seoTitle: "Chiropractic Aftercare Software for Practices | River Aftercare",
    metaDescription:
      "Publish branded chiropractic home-care and post-appointment guidance patients can revisit between visits by link or QR code. No patient app or login required.",
    ogTitle: "Chiropractic Aftercare Software for Practices | River Aftercare",
    ogDescription:
      "Publish branded chiropractic home-care and post-appointment guidance patients can revisit between visits by link or QR code. No patient app or login required.",
    ogImagePath: null,
    index: true,
    follow: true,
    lastModified: "2026-09-22",
  },
  "/cosmetic-clinics": {
    seoTitle: "Cosmetic & Aesthetic Aftercare Software | River Aftercare",
    metaDescription:
      "Publish branded post-treatment aftercare for cosmetic and aesthetic clinics. Patients or clients can revisit guidance by link or QR code, with no app or login.",
    ogTitle: "Cosmetic & Aesthetic Aftercare Software | River Aftercare",
    ogDescription:
      "Publish branded post-treatment aftercare for cosmetic and aesthetic clinics. Patients or clients can revisit guidance by link or QR code, with no app or login.",
    ogImagePath: null,
    index: true,
    follow: true,
    lastModified: "2026-09-23",
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
