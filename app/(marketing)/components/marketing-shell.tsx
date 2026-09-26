import Link from "next/link";
import type { ReactNode } from "react";

import { MarketingExperience } from "@/app/(marketing)/components/marketing-experience";
import { MarketingSiteHeader } from "@/app/(marketing)/components/marketing-site-header";
import { ProductMark } from "@/lib/branding/product-mark";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { clinicDirectoryNavItems } from "@/lib/marketing/clinic-verticals";
import type { VerticalThemeId } from "@/lib/marketing/vertical-landing";
import type { MarketingSeoPath } from "@/lib/seo/types";

import styles from "../marketing.module.css";

export type MarketingPath = MarketingSeoPath;

type FooterLink = {
  href: string;
  label: string;
};

const FOOTER_GROUPS = [
  {
    id: "clinics",
    label: "For clinics",
    links: clinicDirectoryNavItems("").map((item) => ({
      href: item.href,
      label: item.label,
    })),
  },
  {
    id: "product",
    label: "Product",
    links: [
      { href: "/about", label: "About" },
      { href: "/pricing", label: "Pricing" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    id: "legal",
    label: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
] as const;

const PRIMARY_NAV = [
  { href: "/about", label: "About" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
] as const;

const SIGN_IN_LABEL = "Sign in";

function FooterNavLink({
  link,
  currentPath,
}: {
  link: FooterLink;
  currentPath: MarketingPath;
}) {
  const current = currentPath === link.href;
  const className = styles.textLink;

  if (link.href.startsWith("/")) {
    return (
      <Link
        className={className}
        href={link.href}
        aria-current={current ? "page" : undefined}
      >
        {link.label}
      </Link>
    );
  }

  return (
    <a className={className} href={link.href}>
      {link.label}
    </a>
  );
}

export function MarketingShell({
  currentPath,
  staffHref,
  children,
  verticalId,
}: {
  currentPath: MarketingPath;
  staffHref: string;
  children: ReactNode;
  verticalId?: VerticalThemeId;
}) {
  const menuItems = PRIMARY_NAV.map((item) => ({
    ...item,
    current: currentPath === item.href,
  }));
  const clinicItems = clinicDirectoryNavItems(currentPath);

  const footerGroups = [
    FOOTER_GROUPS[0],
    {
      id: FOOTER_GROUPS[1].id,
      label: FOOTER_GROUPS[1].label,
      links: [
        ...FOOTER_GROUPS[1].links,
        { href: staffHref, label: SIGN_IN_LABEL },
      ],
    },
    FOOTER_GROUPS[2],
  ] as const;

  return (
    <MarketingExperience className={styles.page} verticalId={verticalId}>
      <MarketingSiteHeader
        currentPath={currentPath}
        staffHref={staffHref}
        menuItems={menuItems}
        clinicItems={clinicItems}
      />
      {children}
      <footer className={styles.footer}>
        <div className={styles.inner}>
          <div className={styles.footerSeparator} aria-hidden="true" />
          <div className={styles.footerInner}>
            <div className={styles.footerBrand}>
              <p className={styles.footerName}>
                <ProductMark className={styles.footerMark} />
                {PRODUCT_NAME}
              </p>
              <p className={styles.footerTag}>
                Branded patient aftercare for clinics and practices.
              </p>
            </div>
            <nav className={styles.footerNav} aria-label="Footer">
              {footerGroups.map((group) => (
                <div key={group.id} className={styles.footerNavGroup}>
                  <p
                    className={styles.footerNavLabel}
                    id={`footer-${group.id}`}
                  >
                    {group.label}
                  </p>
                  <ul
                    className={styles.footerNavList}
                    aria-labelledby={`footer-${group.id}`}
                  >
                    {group.links.map((link) => (
                      <li key={link.href}>
                        <FooterNavLink link={link} currentPath={currentPath} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </div>
          <p className={styles.footerCopy}>
            © {new Date().getFullYear()} {PRODUCT_NAME}
          </p>
        </div>
      </footer>
    </MarketingExperience>
  );
}
