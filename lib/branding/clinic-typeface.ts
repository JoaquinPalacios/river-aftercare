export const CLINIC_TYPEFACE_IDS = [
  "OPEN_SANS",
  "ROBOTO",
  "MONTSERRAT",
  "LATO",
  "POPPINS",
  "INTER",
] as const;

export type ClinicTypefaceId = (typeof CLINIC_TYPEFACE_IDS)[number];

export const DEFAULT_CLINIC_TYPEFACE = null;

export const CLINIC_TYPEFACE_OPTIONS: ReadonlyArray<{
  id: ClinicTypefaceId;
  label: string;
  cssVariable: `--font-clinic-${string}`;
}> = [
  {
    id: "OPEN_SANS",
    label: "Open Sans",
    cssVariable: "--font-clinic-open-sans",
  },
  { id: "ROBOTO", label: "Roboto", cssVariable: "--font-clinic-roboto" },
  {
    id: "MONTSERRAT",
    label: "Montserrat",
    cssVariable: "--font-clinic-montserrat",
  },
  { id: "LATO", label: "Lato", cssVariable: "--font-clinic-lato" },
  { id: "POPPINS", label: "Poppins", cssVariable: "--font-clinic-poppins" },
  { id: "INTER", label: "Inter", cssVariable: "--font-clinic-inter" },
];

const TYPEFACE_BY_ID = new Map(
  CLINIC_TYPEFACE_OPTIONS.map((option) => [option.id, option])
);

export function isClinicTypefaceId(value: unknown): value is ClinicTypefaceId {
  return (
    typeof value === "string" &&
    CLINIC_TYPEFACE_IDS.includes(value as ClinicTypefaceId)
  );
}

/**
 * Persisted clinic typeface or `null` for the River Aftercare default (Geist).
 * Unknown values fail closed to the product typeface.
 */
export function parseClinicTypeface(
  value: string | null | undefined
): ClinicTypefaceId | null {
  if (value == null) {
    return null;
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    return null;
  }
  return isClinicTypefaceId(normalized) ? normalized : null;
}

export function clinicTypefaceLabel(
  value: string | null | undefined
): string | null {
  const parsed = parseClinicTypeface(value);
  return parsed ? (TYPEFACE_BY_ID.get(parsed)?.label ?? null) : null;
}

export function clinicTypefaceCssVariable(
  value: string | null | undefined
): `--font-clinic-${string}` | null {
  const parsed = parseClinicTypeface(value);
  return parsed ? (TYPEFACE_BY_ID.get(parsed)?.cssVariable ?? null) : null;
}
