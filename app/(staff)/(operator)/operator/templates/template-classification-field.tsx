"use client";

import Link from "next/link";

import type { ServiceCategory } from "@/lib/aftercare/service-category";
import { serviceCategoryLabel } from "@/lib/aftercare/service-category";
import {
  activeSampleConflictMessage,
  type CanonicalTemplateClassification,
} from "@/lib/canonical-templates/classification";

export interface TemplateClassificationOption {
  id: string;
  title: string;
  serviceCategory: ServiceCategory;
}

export function activeSampleForCategory(
  samples: readonly TemplateClassificationOption[],
  serviceCategory: string,
  exceptTemplateId?: string
): TemplateClassificationOption | null {
  return (
    samples.find(
      (sample) =>
        sample.serviceCategory === serviceCategory &&
        sample.id !== exceptTemplateId
    ) ?? null
  );
}

export function TemplateClassificationField({
  value,
  onChange,
  serviceCategory,
  activeSample,
  error,
}: {
  value: CanonicalTemplateClassification;
  onChange: (value: CanonicalTemplateClassification) => void;
  serviceCategory: string;
  activeSample: TemplateClassificationOption | null;
  error?: string;
}) {
  const categoryLabel = serviceCategory
    ? (serviceCategoryLabel(serviceCategory as ServiceCategory) ??
      serviceCategory)
    : "";
  const blocked = value === "SAMPLE" && activeSample !== null;
  const describedBy = [
    "classification-hint",
    blocked ? "classification-sample-slot" : "",
    error ? "classification-error" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <fieldset className="staffChoice" aria-describedby={describedBy}>
      <legend className="text-sm font-medium">Classification</legend>
      <div className="staffChoiceOptions">
        {(
          [
            ["PRODUCTION", "Production"],
            ["SAMPLE", "Sample"],
          ] as const
        ).map(([option, label]) => (
          <label key={option} className="staffChoiceOption">
            <input
              type="radio"
              name="classification"
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <p
        id="classification-hint"
        className="staffChoiceHint text-sm text-staff-muted"
      >
        Production templates can be adopted by eligible clinics. A sample stays
        out of that library. Each service category has one active sample.
      </p>
      {blocked && activeSample ? (
        <p
          id="classification-sample-slot"
          className="staffChoiceNote"
          role="status"
        >
          {activeSampleConflictMessage(categoryLabel, activeSample.title)}{" "}
          <Link
            href={`/operator/templates/${activeSample.id}`}
            className="staffChoiceLink"
          >
            View {activeSample.title}
          </Link>
        </p>
      ) : null}
      {error ? (
        <p
          id="classification-error"
          className="staffChoiceHint text-sm text-red-600"
        >
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
