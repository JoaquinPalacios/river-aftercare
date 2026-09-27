/**
 * Demo sample slug. Ordinary production template creation must refuse it.
 * The demo bootstrap remains the only writer of that row.
 */
export const RESERVED_DEMO_CANONICAL_SLUG = "extraction";

/**
 * Slug reserved for a future production Tooth Extraction template.
 * This phase does not create that template.
 */
export const FUTURE_PRODUCTION_TOOTH_EXTRACTION_SLUG = "tooth-extraction";

export function isReservedDemoCanonicalSlug(slug: string): boolean {
  return slug === RESERVED_DEMO_CANONICAL_SLUG;
}
