"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { PortalAppearanceControl } from "@/app/(staff)/components/portal-appearance-control";
import { StaffAccountPanel } from "@/app/(staff)/components/staff-account-panel";
import { stopOperatorClinicSupportAction } from "@/app/(staff)/(operator)/operator/support-actions";
import { ProductMark } from "@/lib/branding/product-mark";
import { ExternalLinkIcon } from "@/app/(staff)/components/icons";
import { PRODUCT_NAME } from "@/lib/branding/product-name";

export function PortalChrome({
  displayName,
  userLabel,
  roleLabel,
  patientSiteHref,
  canManagePractice,
  assistingClinicName = null,
  children,
}: {
  displayName: string;
  userLabel: string;
  roleLabel: string;
  patientSiteHref: string | null;
  canManagePractice: boolean;
  assistingClinicName?: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const reactId = useId().replace(/:/g, "");
  const menuId = `portal-nav-${reactId}`;
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) {
      return;
    }

    const sync = () => setOpen(menu.matches(":popover-open"));
    menu.addEventListener("toggle", sync);
    return () => menu.removeEventListener("toggle", sync);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        menuRef.current?.hidePopover();
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="staffAppShell">
      <aside className="staffAppSidebar">
        <PortalBrand displayName={displayName} />
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <PortalNav
            pathname={pathname}
            patientSiteHref={patientSiteHref}
            canManagePractice={canManagePractice}
            onNavigate={() => undefined}
          />
          <div className="mt-auto">
            <div className="staffNavRule" role="presentation" />
            <div className="staffNavGroup" aria-label="Preferences">
              <PortalAppearanceControl />
            </div>
            <div className="staffNavRule" role="presentation" />
            <StaffAccountPanel userLabel={userLabel} roleLabel={roleLabel} />
          </div>
        </div>
      </aside>

      <div className="staffAppMain">
        <header className="flex items-center justify-between gap-3 border-b border-staff-line bg-staff-panel px-4 py-3 md:hidden">
          <PortalBrand displayName={displayName} compact />
          <button
            ref={triggerRef}
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-staff-line text-staff-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff-brand"
            popoverTarget={menuId}
            popoverTargetAction="toggle"
            aria-haspopup="true"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label="Clinic portal menu"
          >
            <span className="flex flex-col gap-1" aria-hidden="true">
              <span className="block h-px w-4 bg-current" />
              <span className="block h-px w-4 bg-current" />
              <span className="block h-px w-4 bg-current" />
            </span>
          </button>
          <div
            ref={menuRef}
            id={menuId}
            popover="auto"
            inert={!open || undefined}
            className="inset-auto top-[3.6rem] right-3 left-3 m-0 w-auto max-w-none overflow-hidden rounded-xl border border-staff-line bg-staff-panel p-2 text-staff-ink shadow-lg"
          >
            <PortalNav
              pathname={pathname}
              patientSiteHref={patientSiteHref}
              canManagePractice={canManagePractice}
              onNavigate={() => menuRef.current?.hidePopover()}
            />
            <div className="staffNavRule" role="presentation" />
            <div className="staffNavGroup" aria-label="Preferences">
              <PortalAppearanceControl />
            </div>
            <div className="staffNavRule" role="presentation" />
            <StaffAccountPanel userLabel={userLabel} roleLabel={roleLabel} />
          </div>
        </header>
        <main className="staffAppScroller">
          <div className="staffAppContent">
            {assistingClinicName ? (
              <div className="staffOperatorAssistBanner" role="status">
                <p>
                  Assisting {assistingClinicName} as a platform operator. Clinic
                  data changes apply to this client only.
                </p>
                <form action={stopOperatorClinicSupportAction}>
                  <button type="submit" className="staffBtn staffBtnQuiet">
                    Back to All Clinics
                  </button>
                </form>
              </div>
            ) : null}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function PortalBrand({
  displayName,
  compact = false,
}: {
  displayName: string;
  compact?: boolean;
}) {
  return (
    <div
      className={compact ? "min-w-0" : "border-b border-staff-line px-5 py-5"}
    >
      <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
        <ProductMark className="h-5 w-5 text-staff-brand" />
        {PRODUCT_NAME}
      </p>
      <p className="mt-1 truncate text-sm text-staff-muted">{displayName}</p>
    </div>
  );
}

function PortalNav({
  pathname,
  patientSiteHref,
  canManagePractice,
  onNavigate,
}: {
  pathname: string;
  patientSiteHref: string | null;
  canManagePractice: boolean;
  onNavigate: () => void;
}) {
  const items = [
    { href: "/dashboard", label: "Overview" },
    { href: "/guides", label: "Guides" },
    ...(canManagePractice ? [{ href: "/practice", label: "Practice" }] : []),
  ];

  return (
    <nav aria-label="Clinic portal">
      <div className="staffNavGroup">
        {items.map((item) => {
          const current =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={current ? "page" : undefined}
              onClick={onNavigate}
              className="staffNavRow"
            >
              {item.label}
            </Link>
          );
        })}
      </div>
      {patientSiteHref ? (
        <>
          <div className="staffNavRule" role="presentation" />
          <div className="staffNavGroup">
            <a
              href={patientSiteHref}
              target="_blank"
              rel="noreferrer"
              className="staffNavRow staffNavRowMuted"
            >
              View patient site
              <span className="sr-only"> (opens in a new tab)</span>
              <ExternalLinkIcon className="ml-1" />
            </a>
          </div>
        </>
      ) : null}
    </nav>
  );
}
