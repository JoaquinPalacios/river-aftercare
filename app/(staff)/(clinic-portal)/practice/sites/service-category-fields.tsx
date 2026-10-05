"use client";

import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
  type ServiceCategory,
} from "@/lib/aftercare/service-category";

export function ServiceCategoryFields({
  selected,
  disabled = false,
  legend = "Services",
  description = "Choose every service this site provides. A site can offer more than one. Leave this blank until the site is classified.",
  error,
}: {
  selected: readonly ServiceCategory[];
  disabled?: boolean;
  legend?: string;
  description?: string;
  error?: string;
}) {
  return (
    <fieldset
      className="grid gap-2"
      disabled={disabled}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? "service-categories-error" : undefined}
    >
      <legend className="text-sm font-medium">{legend}</legend>
      <p className="text-sm text-staff-muted">{description}</p>
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
      {error ? (
        <p
          id="service-categories-error"
          className="text-sm text-red-600"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
