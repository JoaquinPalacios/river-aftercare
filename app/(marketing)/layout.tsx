import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { geistSans } from "@/lib/branding/fonts";
import { HOME_METADATA, marketingMetadataBase } from "@/lib/marketing/metadata";
import { PRODUCT_HEAD_METADATA } from "@/lib/seo/icons";
import { marketingMotionBootstrapScript } from "@/lib/marketing/motion-bootstrap";
import {
  MARKETING_THEME_STORAGE_KEY,
  PRODUCT_THEME_COOKIE_NAME,
  productThemeCookieDomain,
  themePreferenceBootstrapScript,
} from "@/lib/branding/theme-preference";
import { getRootDomain } from "@/lib/tenancy/root-domain";
import { NavigationProgress } from "@/app/components/navigation-progress";
import { VercelWebAnalytics } from "@/lib/telemetry/vercel-web-analytics";

import "./marketing.css";

export function generateMetadata(): Metadata {
  return {
    metadataBase: marketingMetadataBase(),
    title: {
      default: HOME_METADATA.title,
      // Identity-preserving template: SEO titles already include the brand
      // when needed. Do not append " — River Aftercare" here.
      template: "%s",
    },
    ...PRODUCT_HEAD_METADATA,
  };
}

export default function MarketingRootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const cookieDomain = productThemeCookieDomain(getRootDomain());

  return (
    <html
      lang="en"
      className={geistSans.variable}
      suppressHydrationWarning
      data-theme-cookie-domain={cookieDomain}
    >
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: themePreferenceBootstrapScript(
              MARKETING_THEME_STORAGE_KEY,
              {
                cookieName: PRODUCT_THEME_COOKIE_NAME,
              }
            ),
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: marketingMotionBootstrapScript(),
          }}
        />
        <noscript>
          <style>
            {
              "html[data-mk-motion] .mkReveal{opacity:1!important;transform:none!important;animation:none!important}"
            }
          </style>
        </noscript>
        <NavigationProgress />
        {children}
        <VercelWebAnalytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
