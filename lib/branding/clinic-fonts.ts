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
