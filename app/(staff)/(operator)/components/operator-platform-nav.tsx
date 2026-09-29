"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { StaffNavIcon } from "@/app/(staff)/components/staff-nav-icon";
import type { StaffNavIconName } from "@/app/(staff)/components/staff-nav-icon";
import { isNestedStaffNavCurrent } from "@/app/(staff)/components/staff-nav-current";

const LINKS: Array<{
  href: string;
  label: string;
  icon: StaffNavIconName;
}> = [
  { href: "/operator/clinics", label: "Clinics", icon: "clinics" },
  { href: "/operator/templates", label: "Templates", icon: "templates" },
  { href: "/operator/seo", label: "SEO & Discovery", icon: "seo" },
];

export function OperatorPlatformNav() {
  const pathname = usePathname();

  return (
    <nav className="staffNavGroup" aria-label="Platform">
      {LINKS.map((link) => {
        const current = isNestedStaffNavCurrent(link.href, pathname);
        return (
          <Link
            key={link.href}
            href={link.href}
            className="staffNavRow"
            data-tooltip={link.label}
            aria-current={current ? "page" : undefined}
          >
            <StaffNavIcon name={link.icon} />
            <span className="staffNavLabel">{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
