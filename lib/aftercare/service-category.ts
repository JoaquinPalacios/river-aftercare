export const SERVICE_CATEGORIES = [
  "DENTAL",
  "PHYSIOTHERAPY",
  "CHIROPRACTIC",
  "COSMETIC_AESTHETIC",
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  DENTAL: "Dental",
  PHYSIOTHERAPY: "Physiotherapy",
  CHIROPRACTIC: "Chiropractic",
  COSMETIC_AESTHETIC: "Cosmetic & Aesthetic",
};

export function isServiceCategory(value: string): value is ServiceCategory {
  return (SERVICE_CATEGORIES as readonly string[]).includes(value);
}

export function serviceCategoryLabel(
  category: ServiceCategory | null | undefined
): string | null {
  if (!category) {
    return null;
  }
  return SERVICE_CATEGORY_LABELS[category];
}

export function uniqueServiceCategories(
  categories: readonly ServiceCategory[]
): ServiceCategory[] {
  return SERVICE_CATEGORIES.filter((category) => categories.includes(category));
}
