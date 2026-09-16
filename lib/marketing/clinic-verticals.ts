import type { MarketingSeoPath } from "@/lib/seo/types";

export const CLINIC_VERTICAL_PATHS = [
  "/dental",
  "/physiotherapy",
  "/chiropractic",
  "/cosmetic-clinics",
] as const;

export type ClinicVerticalPath = (typeof CLINIC_VERTICAL_PATHS)[number];

export interface ClinicVerticalNavItem {
  path: ClinicVerticalPath;
  navLabel: string;
  cardTitle: string;
  cardCopy: string;
}

export const CLINIC_VERTICAL_NAV: readonly ClinicVerticalNavItem[] = [
  {
    path: "/dental",
    navLabel: "Dental",
    cardTitle: "Dental practices",
    cardCopy:
      "Clear, branded post-treatment instructions patients can return to after dental care.",
  },
  {
    path: "/physiotherapy",
    navLabel: "Physiotherapy",
    cardTitle: "Physiotherapy clinics",
    cardCopy:
      "Recovery and home-care guidance patients can revisit between appointments.",
  },
  {
    path: "/chiropractic",
    navLabel: "Chiropractic",
    cardTitle: "Chiropractic practices",
    cardCopy:
      "Clinic-approved home-care and post-appointment guidance in one branded place.",
  },
  {
    path: "/cosmetic-clinics",
    navLabel: "Cosmetic & aesthetic",
    cardTitle: "Cosmetic & aesthetic clinics",
    cardCopy:
      "Post-treatment aftercare that remains part of the clinic experience.",
  },
] as const;

export function isClinicVerticalPath(path: string): path is ClinicVerticalPath {
  return (CLINIC_VERTICAL_PATHS as readonly string[]).includes(path);
}

export function isClinicVerticalSeoPath(
  path: MarketingSeoPath
): path is ClinicVerticalPath {
  return isClinicVerticalPath(path);
}
