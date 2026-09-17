import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";

import { geistSans } from "@/lib/branding/fonts";
import { PRODUCT_HEAD_METADATA } from "@/lib/seo/icons";
import { TENANT_LAUNCH_ROBOTS } from "@/lib/seo/robots-policy";

import "./aftercare.css";

export const metadata: Metadata = {
  title: "Aftercare",
  description: "Patient aftercare guides.",
  robots: TENANT_LAUNCH_ROBOTS,
  ...PRODUCT_HEAD_METADATA,
};

export default function AftercareRootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`aftercareDocument ${geistSans.variable}`}
      suppressHydrationWarning
    >
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
