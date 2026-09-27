"use client";

import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
  type ServiceCategory,
} from "@/lib/aftercare/service-category";

export function ServiceCategoryFields({
  selected,
  disabled = false,
}: {
  selected: readonly ServiceCategory[];
  disabled?: boolean;
}) {
  return (
    <fieldset className="grid gap-2" disabled={disabled}>
      <legend className="text-sm font-medium">Services</legend>
      <p className="text-sm text-staff-muted">
        Choose every service this site provides. A site can offer more than one.
        Leave this blank until the site is classified.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {SERVICE_CATEGORIES.map((category) => (
          <label
            key={category}
            className="flex min-h-11 items-center gap-2 text-sm"
          >
            <input
              type="checkbox"
              name="serviceCategories"
              value={category}
              defaultChecked={selected.includes(category)}
              className="size-4"
            />
            {SERVICE_CATEGORY_LABELS[category]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
