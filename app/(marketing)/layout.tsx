import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { geistSans } from "@/lib/branding/fonts";
import { HOME_METADATA, marketingMetadataBase } from "@/lib/marketing/metadata";
import { PRODUCT_HEAD_METADATA } from "@/lib/seo/icons";
import { marketingMotionBootstrapScript } from "@/lib/marketing/motion-bootstrap";
import {
  MARKETING_THEME_STORAGE_KEY,
  themePreferenceBootstrapScript,
} from "@/lib/branding/theme-preference";

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
  return (
    <html lang="en" className={geistSans.variable} suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: themePreferenceBootstrapScript(MARKETING_THEME_STORAGE_KEY),
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
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
