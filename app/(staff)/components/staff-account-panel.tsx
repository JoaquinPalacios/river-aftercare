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
  const accountCurrent =
    pathname === "/account" || pathname.startsWith("/account/");

  return (
    <div className="staffAccountBlock">
      <div className="staffAccountMeta">
        <p className="truncate text-sm font-medium text-staff-ink">
          {userLabel}
        </p>
        <p className="staffAccountRole">{roleLabel}</p>
      </div>
      <Link
        href="/account"
        className="staffNavRow"
        aria-current={accountCurrent ? "page" : undefined}
      >
        Account
      </Link>
      <LogoutButton />
    </div>
  );
}
