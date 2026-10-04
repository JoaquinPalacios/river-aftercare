import { DEMO_AFTERCARE_TENANT_SLUG } from "@/lib/aftercare/demo-tenant";
import { labeledPublicUrl } from "@/lib/tenancy/public-url";
import { getRootDomain } from "@/lib/tenancy/root-domain";
import {
  SHARED_DEMO_HOSTNAME_LABEL,
  SHARED_DEMO_PUBLIC_ORIGIN,
} from "@/lib/tenancy/shared-demo-hostname";

export const SHARED_DEMO_DENTAL_GUIDE_URL = `${SHARED_DEMO_PUBLIC_ORIGIN}/extraction`;

export const SHARED_DEMO_PHYSIO_GUIDE_URL = `${SHARED_DEMO_PUBLIC_ORIGIN}/home-exercise-plan`;

export const SHARED_DEMO_CHIRO_GUIDE_URL = `${SHARED_DEMO_PUBLIC_ORIGIN}/chiropractic-adjustment`;

export const SHARED_DEMO_COSMETIC_GUIDE_URL = `${SHARED_DEMO_PUBLIC_ORIGIN}/superficial-chemical-peel`;

/** Historical patient hostname for the Tooth Extraction guide. */
export const LEGACY_DEMODENTAL_EXTRACTION_URL = `https://${DEMO_AFTERCARE_TENANT_SLUG}.riveraftercare.com.au/extraction`;

/** Marketing default origin that currently resolves to that same guide. */
export const LEGACY_DEMODENTAL_ORIGIN = `https://${DEMO_AFTERCARE_TENANT_SLUG}.riveraftercare.com.au/`;

export const RIVER_AFTERCARE_DEMO_DENTAL_URL_ENV =
  "RIVER_AFTERCARE_DEMO_DENTAL_URL";

export const RIVER_AFTERCARE_DEMO_PHYSIOTHERAPY_URL_ENV =
  "RIVER_AFTERCARE_DEMO_PHYSIOTHERAPY_URL";

export const RIVER_AFTERCARE_DEMO_CHIROPRACTIC_URL_ENV =
  "RIVER_AFTERCARE_DEMO_CHIROPRACTIC_URL";

export const RIVER_AFTERCARE_DEMO_COSMETIC_AESTHETIC_URL_ENV =
  "RIVER_AFTERCARE_DEMO_COSMETIC_AESTHETIC_URL";

export const LEGACY_SHARED_DEMO_DENTAL_URL_ENV =
  "CARE_GUIDE_SHARED_DEMO_DENTAL_URL";

export const LEGACY_PHYSIO_DEMO_PUBLIC_URL_ENV =
  "CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL";

/** Partial environment. Accepts `process.env` and test objects without `NODE_ENV`. */
export type MarketingDemoEnv = {
  [key: string]: string | undefined;
};

/**
 * Returns the expected guide URL only when the configured value is that
 * exact HTTPS URL on the expected host and path. A trailing slash is ignored.
 * Any other host, path, query, or hash stays unpublished.
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
  if (url.protocol !== "https:") {
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

/**
 * First non-blank value. A blank newer variable does not hide a legacy value.
 * A non-blank newer variable wins even when it later fails validation.
 */
export function preferredConfiguredValue(
  ...values: Array<string | undefined>
): string | undefined {
  for (const value of values) {
    if (value !== undefined && value.trim() !== "") {
      return value;
    }
  }
  return undefined;
}

/**
 * The designated historical Tooth Extraction address becomes the preferred
 * shared guide. Any other URL, including another clinic hostname, is not
 * rewritten.
 */
export function normalizeLegacyDentalDemoUrl(
  configured: string | undefined
): string | null {
  if (
    exactVerifiedGuideHref(configured, LEGACY_DEMODENTAL_EXTRACTION_URL) ||
    exactVerifiedGuideHref(configured, LEGACY_DEMODENTAL_ORIGIN)
  ) {
    return SHARED_DEMO_DENTAL_GUIDE_URL;
  }
  return null;
}

function readDemoEnv(env: MarketingDemoEnv, key: string): string | undefined {
  return env[key];
}

export function physiotherapyDemoExampleHref(
  env: MarketingDemoEnv = process.env
): string | null {
  return exactVerifiedGuideHref(
    preferredConfiguredValue(
      readDemoEnv(env, RIVER_AFTERCARE_DEMO_PHYSIOTHERAPY_URL_ENV),
      readDemoEnv(env, LEGACY_PHYSIO_DEMO_PUBLIC_URL_ENV)
    ),
    SHARED_DEMO_PHYSIO_GUIDE_URL
  );
}

export function chiropracticDemoExampleHref(
  env: MarketingDemoEnv = process.env
): string | null {
  return exactVerifiedGuideHref(
    readDemoEnv(env, RIVER_AFTERCARE_DEMO_CHIROPRACTIC_URL_ENV),
    SHARED_DEMO_CHIRO_GUIDE_URL
  );
}

/**
 * Cosmetic & Aesthetic marketing links to the Superficial Chemical Peel guide.
 * The shared hostname is used only when its exact URL is configured.
 */
export function cosmeticAestheticDemoExampleHref(
  env: MarketingDemoEnv = process.env
): string | null {
  return exactVerifiedGuideHref(
    readDemoEnv(env, RIVER_AFTERCARE_DEMO_COSMETIC_AESTHETIC_URL_ENV),
    SHARED_DEMO_COSMETIC_GUIDE_URL
  );
}

function extractionHref(legacyDemoHref: string): string {
  const root = legacyDemoHref.endsWith("/")
    ? legacyDemoHref
    : `${legacyDemoHref}/`;
  return new URL("extraction", root).href;
}

function fallbackDentalGuideHref(legacyDemoHref?: string): string {
  if (legacyDemoHref) {
    const guide = extractionHref(legacyDemoHref);
    return normalizeLegacyDentalDemoUrl(guide) ?? guide;
  }
  const rootDomain = getRootDomain();
  const constructed =
    labeledPublicUrl({
      requestHost: rootDomain,
      rootDomain,
      label: DEMO_AFTERCARE_TENANT_SLUG,
      protocol: "https",
      pathname: "/extraction",
    }) ?? `https://${DEMO_AFTERCARE_TENANT_SLUG}.${rootDomain}/extraction`;
  return normalizeLegacyDentalDemoUrl(constructed) ?? constructed;
}

/**
 * Dental marketing links to the Tooth Extraction guide on the shared hostname.
 * A configured legacy demodental guide is recognised and resolved to that
 * hostname. Local development origins that are not that designated URL stay
 * on their own host. An unrecognised configured URL is not published.
 */
export function dentalDemoGuideHref(
  env: MarketingDemoEnv = process.env,
  legacyDemoHref?: string
): string {
  const configured = preferredConfiguredValue(
    readDemoEnv(env, RIVER_AFTERCARE_DEMO_DENTAL_URL_ENV),
    readDemoEnv(env, LEGACY_SHARED_DEMO_DENTAL_URL_ENV)
  );
  if (configured) {
    const verified =
      exactVerifiedGuideHref(configured, SHARED_DEMO_DENTAL_GUIDE_URL) ??
      normalizeLegacyDentalDemoUrl(configured);
    if (verified) {
      return verified;
    }
    return SHARED_DEMO_DENTAL_GUIDE_URL;
  }
  return fallbackDentalGuideHref(legacyDemoHref);
}

export const SHARED_DEMO_HOSTNAME_FOR_LINKS = SHARED_DEMO_HOSTNAME_LABEL;
