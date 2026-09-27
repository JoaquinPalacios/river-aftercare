import {
  serviceCategoryLabel,
  type ServiceCategory,
} from "@/lib/aftercare/service-category";

/**
 * A guide may be offered at a location when its classification is one of that
 * location's parent site categories.
 *
 * Unclassified guides and unclassified sites stay compatible. Existing rows
 * were not guessed, and a missing classification is not a mismatch.
 * A multi-category site accepts a guide in any of its categories.
 */
export function guideServiceCompatibleWithSite(input: {
  guideServiceCategory: ServiceCategory | null;
  siteServiceCategories: readonly ServiceCategory[];
}): boolean {
  if (!input.guideServiceCategory) {
    return true;
  }
  if (input.siteServiceCategories.length === 0) {
    return true;
  }
  return input.siteServiceCategories.includes(input.guideServiceCategory);
}

export function guideServiceMismatchMessage(input: {
  guideServiceCategory: ServiceCategory | null;
  siteServiceCategories: readonly ServiceCategory[];
  locationName?: string | null;
  siteName?: string | null;
}): string | null {
  if (guideServiceCompatibleWithSite(input)) {
    return null;
  }
  const guideLabel = serviceCategoryLabel(input.guideServiceCategory);
  const siteLabels = input.siteServiceCategories
    .map((category) => serviceCategoryLabel(category))
    .filter((label): label is string => Boolean(label))
    .join(", ");
  const locationName = input.locationName?.trim() ?? "";
  const siteName = input.siteName?.trim() ?? "";
  const place =
    locationName && siteName
      ? `${locationName} (${siteName})`
      : locationName || siteName || "a site";
  return `${guideLabel} guides cannot be offered at ${place}, which provides ${siteLabels}.`;
}
