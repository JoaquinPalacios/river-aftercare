"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoutButton } from "@/app/(staff)/components/logout-button";
import { StaffNavIcon } from "@/app/(staff)/components/staff-nav-icon";
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
      <div
        className="staffAccountMeta"
        data-tooltip={`${userLabel}, ${roleLabel}`}
      >
        <StaffNavIcon name="account" />
        <div className="staffAccountCopy">
          <p className="truncate text-sm font-medium text-staff-ink">
            {userLabel}
          </p>
          <p className="staffAccountRole">{roleLabel}</p>
        </div>
      </div>
      <Link
        href="/account"
        className="staffNavRow"
        data-tooltip={`${userLabel} · Account`}
        aria-current={accountCurrent ? "page" : undefined}
      >
        <StaffNavIcon name="account" />
        <span className="staffNavLabel">Account</span>
      </Link>
      {billingHref ? (
        <Link
          href={billingHref}
          className="staffNavRow"
          data-tooltip="Billing"
          aria-current={billingCurrent ? "page" : undefined}
        >
          <StaffNavIcon name="billing" />
          <span className="staffNavLabel">Billing</span>
        </Link>
      ) : null}
      <LogoutButton />
    </div>
  );
}
