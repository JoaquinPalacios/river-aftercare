/**
 * Current-item rules for staff sidebars.
 * Overview and Practice are exact so a child route does not select a sibling.
 * Other sections stay current for their nested routes.
 */

export function isNestedStaffNavCurrent(
  href: string,
  pathname: string
): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isClinicPortalNavCurrent(
  href: string,
  pathname: string
): boolean {
  if (href === "/dashboard" || href === "/practice") {
    return pathname === href;
  }

  return isNestedStaffNavCurrent(href, pathname);
}

export function staffAccountNavCurrent(pathname: string): {
  account: boolean;
  billing: boolean;
} {
  const billing = pathname.startsWith("/account/billing");
  return {
    billing,
    account:
      pathname === "/account" || (pathname.startsWith("/account/") && !billing),
  };
}
