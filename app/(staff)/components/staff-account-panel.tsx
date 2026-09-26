"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoutButton } from "@/app/(staff)/components/logout-button";
import { staffAccountNavCurrent } from "@/app/(staff)/components/staff-nav-current";

export function StaffAccountPanel({
  userLabel,
  roleLabel,
  billingHref = null,
}: {
  userLabel: string;
  roleLabel: string;
  billingHref?: string | null;
}) {
  const pathname = usePathname();
  const { account: accountCurrent, billing: billingCurrent } =
    staffAccountNavCurrent(pathname);

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
      {billingHref ? (
        <Link
          href={billingHref}
          className="staffNavRow"
          aria-current={billingCurrent ? "page" : undefined}
        >
          Billing
        </Link>
      ) : null}
      <LogoutButton />
    </div>
  );
}
