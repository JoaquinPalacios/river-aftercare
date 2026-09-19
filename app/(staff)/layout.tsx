import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { geistMono, geistSans } from "@/lib/branding/fonts";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { PRODUCT_HEAD_METADATA } from "@/lib/seo/icons";
import { PRIVATE_ROBOTS } from "@/lib/seo/robots-policy";
import {
  PORTAL_THEME_STORAGE_KEY,
  themePreferenceBootstrapScript,
} from "@/lib/branding/theme-preference";
import { NavigationProgress } from "@/app/components/navigation-progress";
import { VercelWebAnalytics } from "@/lib/telemetry/vercel-web-analytics";

import "./staff.css";

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: `Clinic aftercare portal for ${PRODUCT_NAME}.`,
  robots: PRIVATE_ROBOTS,
  ...PRODUCT_HEAD_METADATA,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <script
          dangerouslySetInnerHTML={{
            __html: themePreferenceBootstrapScript(PORTAL_THEME_STORAGE_KEY),
          }}
        />
        <NavigationProgress />
        {children}
        <VercelWebAnalytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
