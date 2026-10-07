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
  help: boolean;
} {
  const billing = pathname.startsWith("/account/billing");
  const help =
    pathname === "/account/help" || pathname.startsWith("/account/help/");
  return {
    billing,
    help,
    account:
      pathname === "/account" ||
      (pathname.startsWith("/account/") && !billing && !help),
  };
}
