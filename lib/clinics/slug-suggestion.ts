import {
  CARE_GUIDE_SLUG_MAX_LENGTH,
  isValidCareGuideSlug,
} from "@/lib/aftercare/slug-rules";
import { isReservedLocationSlug } from "@/lib/clinics/reserved-location-slugs";
import { isReservedTenantSlug } from "@/lib/tenancy/reserved-slugs";

function normalizeSlugSource(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, CARE_GUIDE_SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
}

function withFallback(normalized: string, fallback: string): string {
  const base = normalized.length > 0 ? normalized : fallback;
  if (base.length >= 3) {
    return base.slice(0, CARE_GUIDE_SLUG_MAX_LENGTH).replace(/-+$/g, "");
  }
  const padded = `${base}-${fallback}`.replace(/^-+|-+$/g, "");
  return padded.slice(0, CARE_GUIDE_SLUG_MAX_LENGTH).replace(/-+$/g, "");
}

export function suggestSiteSlug(name: string): string {
  const candidate = withFallback(normalizeSlugSource(name), "site");
  if (isValidCareGuideSlug(candidate) && !isReservedTenantSlug(candidate)) {
    return candidate;
  }
  const safe = withFallback(`${candidate}-site`, "site");
  return isValidCareGuideSlug(safe) && !isReservedTenantSlug(safe)
    ? safe
    : "clinic-site";
}

export function suggestLocationSlug(name: string): string {
  const candidate = withFallback(normalizeSlugSource(name), "location");
  if (isValidCareGuideSlug(candidate) && !isReservedLocationSlug(candidate)) {
    return candidate;
  }
  const safe = withFallback(`${candidate}-place`, "location");
  return isValidCareGuideSlug(safe) && !isReservedLocationSlug(safe)
    ? safe
    : "location";
}

/** Suggested guide slug. Does not rewrite reserved hosts or add collision suffixes. */
export function suggestGuideSlug(name: string): string {
  return normalizeSlugSource(name);
}
