import "server-only";

import { headers } from "next/headers";

import { getClinicBySlug } from "@/lib/aftercare/get-clinic-by-slug";
import { getPatientLocation } from "@/lib/aftercare/get-patient-location";
import { getPublishedPracticeGuide } from "@/lib/aftercare/get-published-practice-guide";
import { isValidCareGuideSlug } from "@/lib/aftercare/slug";
import { isReservedLocationSlug } from "@/lib/clinics/reserved-location-slugs";
import { resolveClinicLocationRedirect } from "@/lib/clinics/location-redirect";
import { clinicPatientSiteUrl } from "@/lib/clinic-portal/patient-site-url";
import { getPrisma } from "@/lib/prisma";
import { normalizePathname } from "@/lib/tenancy/paths";
import { PUBLIC_PATIENT_PATH_HEADER } from "@/lib/tenancy/public-patient-path";
import { isReservedTenantSlug } from "@/lib/tenancy/reserved-slugs";
import { publicHostnameLabelForSiteSlug } from "@/lib/tenancy/shared-demo-hostname";

/**
 * Old non-root location URLs that a future move must keep working.
 * `/{fromSlug}/print` is the root-guide print route and is not one of these.
 */

export type RetiredLocationRedirectPath =
  | { kind: "landing" }
  | { kind: "guide"; guideSlug: string }
  | { kind: "guide-print"; guideSlug: string };

/**
 * Path under a location prefix, after the first segment has been removed.
 * `["print"]` is `/{locationSlug}/print` and is deliberately not a redirect.
 */
export function retiredLocationRedirectPathFromRest(
  rest: string[]
): Exclude<RetiredLocationRedirectPath, { kind: "landing" }> | null {
  const [guideSlug, extra, ...more] = rest;
  if (!guideSlug || more.length > 0 || !isValidCareGuideSlug(guideSlug)) {
    return null;
  }
  if (!extra) {
    if (guideSlug === "print") {
      return null;
    }
    return { kind: "guide", guideSlug };
  }
  if (extra === "print") {
    return { kind: "guide-print", guideSlug };
  }
  return null;
}

/**
 * Exact retired-location shapes on the public pathname.
 * `/{fromSlug}/print` and every other shape return null.
 * The pathname is not a destination URL.
 */
export function retiredLocationRequestFromPublicPath(rawPath: string): {
  fromSlug: string;
  path: RetiredLocationRedirectPath;
} | null {
  if (
    rawPath.length === 0 ||
    !rawPath.startsWith("/") ||
    rawPath.includes("?") ||
    rawPath.includes("#") ||
    rawPath.includes("\\") ||
    rawPath.includes("://")
  ) {
    return null;
  }

  const segments = normalizePathname(rawPath).split("/").filter(Boolean);
  const [fromSlug, ...rest] = segments;
  if (
    !fromSlug ||
    !isValidCareGuideSlug(fromSlug) ||
    isReservedLocationSlug(fromSlug)
  ) {
    return null;
  }
  if (rest.length === 0) {
    return { fromSlug, path: { kind: "landing" } };
  }
  const path = retiredLocationRedirectPathFromRest(rest);
  if (!path) {
    return null;
  }
  return { fromSlug, path };
}

/** Destination path with the location prefix removed. No query string. */
export function destinationPathForRetiredLocation(
  path: RetiredLocationRedirectPath
): string | null {
  if (path.kind === "landing") {
    return "/";
  }
  if (!isValidCareGuideSlug(path.guideSlug) || path.guideSlug === "print") {
    return null;
  }
  if (path.kind === "guide") {
    return `/${path.guideSlug}`;
  }
  return `/${path.guideSlug}/print`;
}

/**
 * Retired-location redirect for one source site slug.
 * An active public tenant still prefers an enabled root guide and an active
 * location. An inactive source site is not loaded as a public tenant. It can
 * only match an exact redirect, and the destination must still pass public
 * site policy. A deactivated clinic does not redirect. The href uses the
 * destination ClinicSite slug. It never copies
 * a query string or a caller-supplied destination.
 */
export async function resolveRetiredLocationRedirectForTenant(input: {
  tenantSlug: string;
  fromSlug: string;
  path: RetiredLocationRedirectPath;
}): Promise<string | null> {
  const pathname = destinationPathForRetiredLocation(input.path);
  if (
    !pathname ||
    !isValidCareGuideSlug(input.tenantSlug) ||
    isReservedTenantSlug(input.tenantSlug) ||
    !isValidCareGuideSlug(input.fromSlug) ||
    isReservedLocationSlug(input.fromSlug)
  ) {
    return null;
  }

  const sourceSite = await getPrisma().clinicSite.findUnique({
    where: { slug: input.tenantSlug },
    select: {
      id: true,
      slug: true,
      clinicId: true,
      clinic: { select: { deactivatedAt: true } },
    },
  });
  if (
    !sourceSite ||
    sourceSite.slug !== input.tenantSlug ||
    sourceSite.clinic.deactivatedAt
  ) {
    return null;
  }

  const publicTenant = await getClinicBySlug(sourceSite.slug);
  if (publicTenant && publicTenant.slug === sourceSite.slug) {
    if (input.path.kind === "landing") {
      const rootGuide = await getPublishedPracticeGuide({
        clinicSlug: sourceSite.slug,
        publicSlug: input.fromSlug,
      });
      if (rootGuide) {
        return null;
      }
    }

    const activeLocation = await getPatientLocation({
      siteSlug: sourceSite.slug,
      locationSlug: input.fromSlug,
    });
    if (activeLocation) {
      return null;
    }
  }

  const resolved = await resolveClinicLocationRedirect({
    sourceClinicSiteId: sourceSite.id,
    fromSlug: input.fromSlug,
  });
  if (
    !resolved ||
    resolved.sourceClinicSiteId !== sourceSite.id ||
    resolved.destinationClinicSiteId === sourceSite.id ||
    resolved.destinationClinicSiteSlug === sourceSite.slug
  ) {
    return null;
  }

  const requestHeaders = await headers();
  const requestHost =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!requestHost) {
    return null;
  }
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (requestHost.includes("localhost") ? "http" : "https");

  const href = clinicPatientSiteUrl({
    requestHost,
    clinicSlug: resolved.destinationClinicSiteSlug,
    protocol,
    pathname,
  });
  if (
    !href ||
    !isClosedRedirectHref(href, resolved.destinationClinicSiteSlug, pathname)
  ) {
    return null;
  }
  return href;
}

/** Same lookup as `resolveRetiredLocationRedirectForTenant`. */
export async function resolveRetiredLocationRedirectHref(input: {
  sourceSiteSlug: string;
  fromSlug: string;
  path: RetiredLocationRedirectPath;
}): Promise<string | null> {
  return resolveRetiredLocationRedirectForTenant({
    tenantSlug: input.sourceSiteSlug,
    fromSlug: input.fromSlug,
    path: input.path,
  });
}

/**
 * Inactive-source fallback for the tenant layout. Reads the public path
 * header that proxy set from the request path. Returns null unless that path
 * is an exact retired-location shape with a stored redirect. Does not return
 * the source site.
 */
export async function resolveInactiveSourceLocationRedirect(
  tenantSlug: string
): Promise<string | null> {
  const publicPath = (await headers()).get(PUBLIC_PATIENT_PATH_HEADER);
  if (!publicPath) {
    return null;
  }
  const request = retiredLocationRequestFromPublicPath(publicPath);
  if (!request) {
    return null;
  }
  return resolveRetiredLocationRedirectForTenant({
    tenantSlug,
    fromSlug: request.fromSlug,
    path: request.path,
  });
}

function isClosedRedirectHref(
  href: string,
  destinationSlug: string,
  pathname: string
): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }
  if (url.username || url.password || url.search || url.hash) {
    return false;
  }
  const hostLabel = url.hostname.split(".")[0];
  if (hostLabel !== publicHostnameLabelForSiteSlug(destinationSlug)) {
    return false;
  }
  return url.pathname === pathname;
}
