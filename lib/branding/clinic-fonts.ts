import localFont from "next/font/local";

// `next/font/local` uses the binding name as the CSS font-family, and that
// name has to match the generated fallback face. Open Sans is `OpenSans`
// because a binding cannot contain a space. The stored typeface id and the
// settings label stay "Open Sans".

import {
  clinicTypefaceCssVariable,
  parseClinicTypeface,
  type ClinicTypefaceId,
} from "@/lib/branding/clinic-typeface";

const OpenSans = localFont({
  src: "./font-files/open-sans-latin.woff2",
  weight: "400 700",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: "Arial",
  declarations: [{ prop: "font-stretch", value: "100%" }],
  variable: "--font-clinic-open-sans",
});

const Roboto = localFont({
  src: "./font-files/roboto-latin.woff2",
  weight: "400 700",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: "Arial",
  declarations: [{ prop: "font-stretch", value: "100%" }],
  variable: "--font-clinic-roboto",
});

const Montserrat = localFont({
  src: "./font-files/montserrat-latin.woff2",
  weight: "400 700",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: "Arial",
  variable: "--font-clinic-montserrat",
});

const Lato = localFont({
  src: [
    {
      path: "./font-files/lato-latin-400.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./font-files/lato-latin-700.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: "Arial",
  variable: "--font-clinic-lato",
});

const Poppins = localFont({
  src: [
    {
      path: "./font-files/poppins-latin-400.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./font-files/poppins-latin-600.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "./font-files/poppins-latin-700.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: "Arial",
  variable: "--font-clinic-poppins",
});

const Inter = localFont({
  src: "./font-files/inter-latin.woff2",
  weight: "400 700",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: "Arial",
  variable: "--font-clinic-inter",
});

const CLINIC_FONTS = {
  OPEN_SANS: OpenSans,
  ROBOTO: Roboto,
  MONTSERRAT: Montserrat,
  LATO: Lato,
  POPPINS: Poppins,
  INTER: Inter,
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
