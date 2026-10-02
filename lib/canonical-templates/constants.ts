/**
 * Slug of the Dental sample. New templates cannot take it.
 * The existing Tooth Extraction row keeps this slug and is edited through
 * the canonical lifecycle. The demo bootstrap creates it once and refuses
 * to overwrite operator edits.
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
