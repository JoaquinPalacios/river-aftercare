import localFont from "next/font/local";

/**
 * Product UI faces. Files are the latin WOFF2 builds previously downloaded
 * from Google Fonts at compile time. `next/font/local` keeps production
 * builds off fonts.googleapis.com and fonts.gstatic.com.
 */
const Geist = localFont({
  src: "./font-files/geist-latin.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  preload: true,
  adjustFontFallback: "Arial",
  variable: "--font-geist-sans",
});

const GeistMono = localFont({
  src: "./font-files/geist-mono-latin.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  preload: true,
  adjustFontFallback: "Arial",
  variable: "--font-geist-mono",
});

export { Geist as geistSans, GeistMono as geistMono };
