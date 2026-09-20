export const STAFF_PATH_PREFIXES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/accept-invitation",
  "/account",
  "/dashboard",
  "/guides",
  "/operator",
  "/sessions",
  "/session",
  "/display",
  "/api/auth",
  "/api/ui-theme",
] as const;

export const MARKETING_PAGE_PATHS = [
  "/",
  "/pricing",
  "/contact",
  "/about",
  "/privacy",
  "/terms",
  "/clinics",
  "/dental",
  "/physiotherapy",
  "/chiropractic",
  "/cosmetic-clinics",
] as const;

export const MARKETING_CRAWL_PATHS = [
  "/sitemap.xml",
  "/robots.txt",
  "/llms.txt",
] as const;

export function isStaffPath(pathname: string): boolean {
  return STAFF_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function isInternalSitesPath(pathname: string): boolean {
  return pathname === "/_sites" || pathname.startsWith("/_sites/");
}

export function isInternalMarketingPath(pathname: string): boolean {
  return pathname === "/_marketing" || pathname.startsWith("/_marketing/");
}

export function isInternalAppPath(pathname: string): boolean {
  return isInternalSitesPath(pathname) || isInternalMarketingPath(pathname);
}

export function isMarketingPagePath(pathname: string): boolean {
  return (MARKETING_PAGE_PATHS as readonly string[]).includes(pathname);
}

export function isMarketingCrawlPath(pathname: string): boolean {
  return (MARKETING_CRAWL_PATHS as readonly string[]).includes(pathname);
}

export function marketingRewritePath(pathname: string): string | null {
  if (!isMarketingPagePath(pathname)) {
    return null;
  }

  return pathname === "/" ? "/_marketing" : `/_marketing${pathname}`;
}

export function normalizePathname(pathname: string): string {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    decoded = pathname;
  }

  if (!decoded.startsWith("/")) {
    decoded = `/${decoded}`;
  }

  const resolved: string[] = [];
  for (const segment of decoded.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }

  return `/${resolved.join("/")}`;
}
