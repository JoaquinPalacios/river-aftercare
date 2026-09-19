import { describe, expect, it } from "vitest";

import { practiceSettingsSchema } from "@/lib/clinic-portal/practice-settings-schema";

const valid = {
  displayName: "Harbor Family Dental",
  logoUrl: "/demo/riverside-mark.svg",
  primaryColor: "#155e75",
  accentColor: "#b45309",
  neutralColor: "#f7f7f5",
  radiusPreset: "SOFT",
  instructionTerminology: "POST_TREATMENT",
  themeMode: "DARK",
  allowPatientThemeToggle: true,
  phone: "02 5550 0100",
  contactUrl: "https://www.example.com/contact",
  addressLine1: "1 Harbor Street",
  addressLine2: "",
  city: "Sydney",
  region: "NSW",
  postalCode: "2000",
  emergencyInstructions: "Call the clinic or emergency services.",
};

describe("practice settings schema", () => {
  it("accepts controlled branding and contact fields", () => {
    expect(practiceSettingsSchema.parse(valid)).toMatchObject({
      displayName: "Harbor Family Dental",
      logoUrl: "/demo/riverside-mark.svg",
      primaryColor: "#155e75",
      accentColor: "#b45309",
      radiusPreset: "SOFT",
      typeface: null,
      instructionTerminology: "POST_TREATMENT",
      themeMode: "DARK",
      allowPatientThemeToggle: true,
      phone: "02 5550 0100",
      contactUrl: "https://www.example.com/contact",
      emergencyInstructions: "Call the clinic or emergency services.",
    });
  });

  it("rejects invalid colours, remote logos, and unsafe URLs", () => {
    expect(
      practiceSettingsSchema.safeParse({
        ...valid,
        primaryColor: "teal",
      }).success
    ).toBe(false);
    expect(
      practiceSettingsSchema.safeParse({
        ...valid,
        logoUrl:
          "clinics/clinic_a/branding/11111111-1111-4111-8111-111111111111.png",
      }).success
    ).toBe(true);
    expect(
      practiceSettingsSchema.safeParse({
        ...valid,
        logoUrl: "https://evil.test/logo.png",
      }).success
    ).toBe(false);
    expect(
      practiceSettingsSchema.safeParse({
        ...valid,
        logoUrl: "data:image/png;base64,aaaa",
      }).success
    ).toBe(false);
    expect(
      practiceSettingsSchema.safeParse({
        ...valid,
        contactUrl: "javascript:alert(1)",
      }).success
    ).toBe(false);
  });

  it("accepts curated typefaces and falls back to the product default", () => {
    expect(
      practiceSettingsSchema.parse({
        ...valid,
        typeface: "INTER",
      }).typeface
    ).toBe("INTER");
    expect(
      practiceSettingsSchema.parse({
        ...valid,
        typeface: "Comic Sans",
      }).typeface
    ).toBeNull();
    expect(
      practiceSettingsSchema.parse({
        ...valid,
        typeface: "",
      }).typeface
    ).toBeNull();
  });
});
