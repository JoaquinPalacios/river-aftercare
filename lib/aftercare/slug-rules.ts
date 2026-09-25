export const CARE_GUIDE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CARE_GUIDE_SLUG_MIN_LENGTH = 3;
export const CARE_GUIDE_SLUG_MAX_LENGTH = 32;

export function isValidCareGuideSlug(value: string): boolean {
  return (
    value.length >= CARE_GUIDE_SLUG_MIN_LENGTH &&
    value.length <= CARE_GUIDE_SLUG_MAX_LENGTH &&
    CARE_GUIDE_SLUG_PATTERN.test(value)
  );
}
