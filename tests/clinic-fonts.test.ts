import { describe, expect, it } from "vitest";

import { clinicFontPresentation } from "@/lib/branding/clinic-fonts";

describe("clinic font presentation", () => {
  it("applies the selected next/font variable and ignores invalid values", () => {
    expect(clinicFontPresentation("INTER")).toEqual({
      className: "--font-clinic-inter",
      cssVariable: "--font-clinic-inter",
    });
    expect(clinicFontPresentation("OPEN_SANS").cssVariable).toBe(
      "--font-clinic-open-sans"
    );
    expect(clinicFontPresentation(null)).toEqual({
      className: "",
      cssVariable: null,
    });
    expect(clinicFontPresentation("Comic Sans")).toEqual({
      className: "",
      cssVariable: null,
    });
  });
});
