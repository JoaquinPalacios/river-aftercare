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

export const DEFAULT_MARKETING_PAGE_SEO: Record<
  MarketingSeoPath,
  Omit<MarketingPageSeoInput, "path" | "updatedAt">
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
  },
  "/pricing": {
    seoTitle: "Patient Aftercare Software Pricing | River Aftercare",
    metaDescription: `Compare ${PRODUCT_NAME} plans for clinics and practices, from branded digital aftercare for a single location to multi-location and group support.`,
    ogTitle: null,
    ogDescription: null,
    ogImagePath: null,
    index: INDEXABLE_ROBOTS.index,
    follow: INDEXABLE_ROBOTS.follow,
  },
  "/contact": {
    seoTitle: "Book a Demo | River Aftercare",
    metaDescription: `See how ${PRODUCT_NAME} helps clinics and practices deliver branded treatment and recovery guidance patients can reopen after their appointment.`,
    ogTitle: null,
    ogDescription: null,
    ogImagePath: null,
    index: INDEXABLE_ROBOTS.index,
    follow: INDEXABLE_ROBOTS.follow,
  },
  "/about": {
    seoTitle: "About River Aftercare | Digital Patient Aftercare",
    metaDescription: `${PRODUCT_NAME} helps clinics and practices deliver clear, branded treatment, recovery and home-care instructions after the appointment.`,
    ogTitle: null,
    ogDescription: null,
    ogImagePath: null,
    index: INDEXABLE_ROBOTS.index,
    follow: INDEXABLE_ROBOTS.follow,
  },
  "/privacy": {
    seoTitle: "Privacy Policy",
    metaDescription: `How ${PRODUCT_NAME} handles information on the public website, clinic accounts, and patient aftercare pages. Draft for legal review.`,
    ogTitle: null,
    ogDescription: null,
    ogImagePath: null,
    index: DRAFT_LEGAL_ROBOTS.index,
    follow: DRAFT_LEGAL_ROBOTS.follow,
  },
  "/terms": {
    seoTitle: "Terms & Conditions",
    metaDescription: `Draft terms for using ${PRODUCT_NAME}, a B2B aftercare publishing platform for healthcare practices. Not a substitute for legal advice.`,
    ogTitle: null,
    ogDescription: null,
    ogImagePath: null,
    index: DRAFT_LEGAL_ROBOTS.index,
    follow: DRAFT_LEGAL_ROBOTS.follow,
  },
};

export const MARKETING_PAGE_LABELS: Record<MarketingSeoPath, string> = {
  "/": "Home",
  "/pricing": "Pricing",
  "/contact": "Contact",
  "/about": "About",
  "/privacy": "Privacy Policy",
  "/terms": "Terms & Conditions",
};

export const TITLE_GUIDE_LENGTH = 60;
export const TITLE_MAX_LENGTH = 120;
export const DESCRIPTION_GUIDE_LENGTH = 160;
export const DESCRIPTION_MAX_LENGTH = 320;
export const ORGANIZATION_DESCRIPTION_MAX_LENGTH = 400;
export const SITE_NAME_MAX_LENGTH = 80;
