"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoutButton } from "@/app/(staff)/components/logout-button";

export function StaffAccountPanel({
  userLabel,
  roleLabel,
}: {
  userLabel: string;
  roleLabel: string;
}) {
  const pathname = usePathname();
  const securityCurrent =
    pathname === "/account/security" ||
    pathname.startsWith("/account/security/");

  return (
    <div className="staffAccountBlock">
      <div className="staffAccountMeta">
        <p className="truncate text-sm font-medium text-staff-ink">
          {userLabel}
        </p>
        <p className="staffAccountRole">{roleLabel}</p>
      </div>
      <Link
        href="/account/security"
        className="staffNavRow"
        aria-current={securityCurrent ? "page" : undefined}
      >
        Account security
      </Link>
      <LogoutButton />
    </div>
  );
}
