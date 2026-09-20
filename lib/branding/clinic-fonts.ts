import {
  Inter,
  Lato,
  Montserrat,
  Open_Sans,
  Poppins,
  Roboto,
} from "next/font/google";

import {
  clinicTypefaceCssVariable,
  parseClinicTypeface,
  type ClinicTypefaceId,
} from "@/lib/branding/clinic-typeface";

const clinicOpenSans = Open_Sans({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  adjustFontFallback: true,
  weight: ["400", "600", "700"],
  variable: "--font-clinic-open-sans",
});

const clinicRoboto = Roboto({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  adjustFontFallback: true,
  weight: ["400", "500", "700"],
  variable: "--font-clinic-roboto",
});

const clinicMontserrat = Montserrat({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  adjustFontFallback: true,
  weight: ["400", "600", "700"],
  variable: "--font-clinic-montserrat",
});

const clinicLato = Lato({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  adjustFontFallback: true,
  weight: ["400", "700"],
  variable: "--font-clinic-lato",
});

const clinicPoppins = Poppins({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  adjustFontFallback: true,
  weight: ["400", "600", "700"],
  variable: "--font-clinic-poppins",
});

const clinicInter = Inter({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  adjustFontFallback: true,
  weight: ["400", "600", "700"],
  variable: "--font-clinic-inter",
});

const CLINIC_FONTS = {
  OPEN_SANS: clinicOpenSans,
  ROBOTO: clinicRoboto,
  MONTSERRAT: clinicMontserrat,
  LATO: clinicLato,
  POPPINS: clinicPoppins,
  INTER: clinicInter,
} as const satisfies Record<
  ClinicTypefaceId,
  { variable: string; className: string }
>;

export interface ClinicFontPresentation {
  className: string;
  cssVariable: `--font-clinic-${string}` | null;
}

/**
 * Apply the allow-listed self-hosted family selected for this clinic.
 * Geist remains the patient default when typeface is null or unknown.
 *
 * All six families are initialized in this module because the tenant layout
 * chooses a preset at request time. Next.js collects CSS from every font
 * loader statically reachable from that layout, so a dynamic import does not
 * omit unused `@font-face` rules from the document. `preload: false` keeps
 * unused font *files* off the network; browsers fetch only the selected
 * family's WOFF2.
 */
export function clinicFontPresentation(
  typeface: string | null | undefined
): ClinicFontPresentation {
  const parsed = parseClinicTypeface(typeface);
  const cssVariable = clinicTypefaceCssVariable(parsed);
  if (!parsed || !cssVariable) {
    return { className: "", cssVariable: null };
  }

  return {
    className: CLINIC_FONTS[parsed].variable,
    cssVariable,
  };
}
