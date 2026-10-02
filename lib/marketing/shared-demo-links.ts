import { DEMO_AFTERCARE_TENANT_SLUG } from "@/lib/aftercare/demo-tenant";
import { labeledPublicUrl } from "@/lib/tenancy/public-url";
import { getRootDomain } from "@/lib/tenancy/root-domain";
import {
  SHARED_DEMO_HOSTNAME_LABEL,
  SHARED_DEMO_PUBLIC_ORIGIN,
} from "@/lib/tenancy/shared-demo-hostname";

export const SHARED_DEMO_DENTAL_GUIDE_URL = `${SHARED_DEMO_PUBLIC_ORIGIN}/extraction`;

export const SHARED_DEMO_PHYSIO_GUIDE_URL = `${SHARED_DEMO_PUBLIC_ORIGIN}/home-exercise-plan`;

/**
 * Returns the expected guide URL only when the configured value is that
 * exact http(s) URL. Any other host, path, query, or hash stays unpublished.
 */
export function exactVerifiedGuideHref(
  configured: string | undefined,
  expected: string
): string | null {
  const value = configured?.trim() ?? "";
  if (!value) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return null;
  }
  if (url.search || url.hash || url.username || url.password) {
    return null;
  }
  const pathname =
    url.pathname.length > 1 && url.pathname.endsWith("/")
      ? url.pathname.slice(0, -1)
      : url.pathname;
  const href = `${url.origin}${pathname}`;
  return href === expected ? expected : null;
}

export function physiotherapyDemoExampleHref(
  env:
    | NodeJS.ProcessEnv
    | { CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL?: string } = process.env
): string | null {
  return exactVerifiedGuideHref(
    env.CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL,
    SHARED_DEMO_PHYSIO_GUIDE_URL
  );
}

/**
 * Dental marketing links to the Tooth Extraction guide.
 * The shared hostname is used only when its exact URL is configured.
 * Until then the link stays on the existing demodental guide.
 */
export function dentalDemoGuideHref(
  env:
    | NodeJS.ProcessEnv
    | { CARE_GUIDE_SHARED_DEMO_DENTAL_URL?: string } = process.env,
  legacyDemoHref?: string
): string {
  const verified = exactVerifiedGuideHref(
    env.CARE_GUIDE_SHARED_DEMO_DENTAL_URL,
    SHARED_DEMO_DENTAL_GUIDE_URL
  );
  if (verified) {
    return verified;
  }
  if (legacyDemoHref) {
    const root = legacyDemoHref.endsWith("/")
      ? legacyDemoHref
      : `${legacyDemoHref}/`;
    return new URL("extraction", root).href;
  }
  const rootDomain = getRootDomain();
  return (
    labeledPublicUrl({
      requestHost: rootDomain,
      rootDomain,
      label: DEMO_AFTERCARE_TENANT_SLUG,
      protocol: "https",
      pathname: "/extraction",
    }) ?? `https://${DEMO_AFTERCARE_TENANT_SLUG}.${rootDomain}/extraction`
  );
}

export const SHARED_DEMO_HOSTNAME_FOR_LINKS = SHARED_DEMO_HOSTNAME_LABEL;
