import "server-only";

import { headers } from "next/headers";

import { getClinicBySlug } from "@/lib/aftercare/get-clinic-by-slug";
import { getPatientLocation } from "@/lib/aftercare/get-patient-location";
import { getPublishedPracticeGuide } from "@/lib/aftercare/get-published-practice-guide";
import { isValidCareGuideSlug } from "@/lib/aftercare/slug";
import { resolveClinicLocationRedirect } from "@/lib/clinics/location-redirect";
import { clinicPatientSiteUrl } from "@/lib/clinic-portal/patient-site-url";
import { getPrisma } from "@/lib/prisma";

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
 * Redirect lookup for a source tenant after live content has failed.
 * An enabled root guide wins on the location landing. An active location
 * wins for every shape under that slug. The href uses the destination
 * ClinicSite slug and the current request's root host. It never copies a
 * query string or a caller-supplied destination.
 */
export async function resolveRetiredLocationRedirectHref(input: {
  sourceSiteSlug: string;
  fromSlug: string;
  path: RetiredLocationRedirectPath;
}): Promise<string | null> {
  const pathname = destinationPathForRetiredLocation(input.path);
  if (
    !pathname ||
    !isValidCareGuideSlug(input.sourceSiteSlug) ||
    !isValidCareGuideSlug(input.fromSlug)
  ) {
    return null;
  }

  const tenant = await getClinicBySlug(input.sourceSiteSlug);
  if (!tenant || tenant.slug !== input.sourceSiteSlug) {
    return null;
  }

  const sourceSite = await getPrisma().clinicSite.findUnique({
    where: { slug: tenant.slug },
    select: { id: true, slug: true, clinicId: true, active: true },
  });
  if (
    !sourceSite?.active ||
    sourceSite.clinicId !== tenant.id ||
    sourceSite.slug !== tenant.slug
  ) {
    return null;
  }

  if (input.path.kind === "landing") {
    const rootGuide = await getPublishedPracticeGuide({
      clinicSlug: tenant.slug,
      publicSlug: input.fromSlug,
    });
    if (rootGuide) {
      return null;
    }
  }

  const activeLocation = await getPatientLocation({
    siteSlug: tenant.slug,
    locationSlug: input.fromSlug,
  });
  if (activeLocation) {
    return null;
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
  if (hostLabel !== destinationSlug) {
    return false;
  }
  return url.pathname === pathname;
}
