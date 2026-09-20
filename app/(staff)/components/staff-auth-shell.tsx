import type { ReactNode } from "react";

import { ProductMark } from "@/lib/branding/product-mark";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { marketingPublicLinks } from "@/lib/marketing/public-links";

export async function StaffAuthShell({
  title,
  description,
  backHref,
  backLabel,
  children,
}: {
  title: string;
  description: string;
  backHref?: string;
  backLabel?: string;
  children: ReactNode;
}) {
  const { homeHref } = backHref
    ? { homeHref: backHref }
    : await marketingPublicLinks();
  const href = backHref ?? homeHref;
  const label = backLabel ?? `Back to ${PRODUCT_NAME}`;

  return (
    <main className="staffAuthPage flex flex-1 items-center justify-center bg-staff-canvas px-6 py-16">
      <div className="w-full max-w-md">
        <a href={href} className="staffBackLink" aria-label={label}>
          ← {label}
        </a>
        <div className="staffAuthCard mt-6 w-full rounded-2xl border border-staff-line bg-staff-panel p-8">
          <div className="mb-8 flex flex-col gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-staff-brand">
              <ProductMark className="h-5 w-5" />
              {PRODUCT_NAME}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-staff-ink">
              {title}
            </h1>
            <p className="text-sm leading-6 text-staff-muted">{description}</p>
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
