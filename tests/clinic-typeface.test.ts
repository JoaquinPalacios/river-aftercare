import { describe, expect, it } from "vitest";

import {
  CLINIC_TYPEFACE_IDS,
  CLINIC_TYPEFACE_OPTIONS,
  clinicTypefaceCssVariable,
  clinicTypefaceLabel,
  isClinicTypefaceId,
  parseClinicTypeface,
} from "@/lib/branding/clinic-typeface";

describe("clinic typeface allowlist", () => {
  it("exposes the six curated healthcare typefaces", () => {
    expect([...CLINIC_TYPEFACE_IDS]).toEqual([
      "OPEN_SANS",
      "ROBOTO",
      "MONTSERRAT",
      "LATO",
      "POPPINS",
      "INTER",
    ]);
    expect(CLINIC_TYPEFACE_OPTIONS.map((option) => option.label)).toEqual([
      "Open Sans",
      "Roboto",
      "Montserrat",
      "Lato",
      "Poppins",
      "Inter",
    ]);
  });

  it("accepts supported identifiers and fails closed to the product default", () => {
    expect(parseClinicTypeface("OPEN_SANS")).toBe("OPEN_SANS");
    expect(parseClinicTypeface("INTER")).toBe("INTER");
    expect(isClinicTypefaceId("ROBOTO")).toBe(true);
    expect(parseClinicTypeface(null)).toBeNull();
    expect(parseClinicTypeface("")).toBeNull();
    expect(parseClinicTypeface("   ")).toBeNull();
    expect(parseClinicTypeface("Comic Sans")).toBeNull();
    expect(parseClinicTypeface("geist")).toBeNull();
    expect(parseClinicTypeface("open-sans")).toBeNull();
    expect(clinicTypefaceLabel("Comic Sans")).toBeNull();
    expect(clinicTypefaceCssVariable("not-a-font")).toBeNull();
    expect(clinicTypefaceCssVariable("LATO")).toBe("--font-clinic-lato");
  });
});
