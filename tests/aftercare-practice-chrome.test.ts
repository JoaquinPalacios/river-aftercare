import { describe, expect, it } from "vitest";

import {
  DEMO_AFTERCARE_NOTICE,
  isDemoTenant,
} from "@/lib/aftercare/demo-tenant";
import { resolvePracticeChrome } from "@/lib/aftercare/practice-chrome";

const PROFILE = {
  displayName: "Riverside Dental Demo",
  logoUrl: "/demo/riverside-mark.svg",
  phone: "02 5550 0100",
  bookingUrl: "https://www.example.com/riverside-dental-demo/book",
  contactUrl: "https://www.example.com/riverside-dental-demo/contact",
  emergencyInstructions: "Call the demo clinic during hours.",
  showCareGuideAttribution: true,
};

describe("resolvePracticeChrome", () => {
  it("identifies only demodental as the interactive demo tenant", () => {
    expect(isDemoTenant("demodental")).toBe(true);
    expect(isDemoTenant("pacificdental")).toBe(false);
    expect(isDemoTenant("test-tmpl-vis-normal")).toBe(false);
  });

  it("maps a complete demo profile onto patient chrome", () => {
    const chrome = resolvePracticeChrome({
      slug: "demodental",
      name: "Rivers Care Demo Clinic",
      profile: PROFILE,
    });

    expect(chrome.displayName).toBe("Riverside Dental Demo");
    expect(chrome.logoSrc).toBe("/demo/riverside-mark.svg");
    expect(chrome.phoneHref).toBe("tel:0255500100");
    expect(chrome.bookingHref).toBe(
      "https://www.example.com/riverside-dental-demo/book"
    );
    expect(chrome.contactHref).toBe(
      "https://www.example.com/riverside-dental-demo/contact"
    );
    expect(chrome.emergencyInstructions).toBe(
      "Call the demo clinic during hours."
    );
    expect(chrome.showCareGuideAttribution).toBe(true);
    expect(chrome.showDemoNotice).toBe(true);
    expect(chrome.addressText).toBeNull();
    expect(chrome.instructionTerminology).toBe("AFTERCARE");
    expect(chrome.instructionsLabel).toBe("Aftercare instructions");
    expect(chrome.themeMode).toBe("SYSTEM");
    expect(chrome.allowPatientThemeToggle).toBe(false);
    expect(DEMO_AFTERCARE_NOTICE.toLowerCase()).toContain(
      "not clinical advice"
    );
  });

  it("resolves stored clinic object keys onto the same-origin branding route in tests", () => {
    const chrome = resolvePracticeChrome({
      slug: "demodental",
      name: "Rivers Care Demo Clinic",
      profile: {
        ...PROFILE,
        logoUrl:
          "clinics/clinic_demo_rivers/branding/11111111-1111-4111-8111-111111111111.webp",
      },
    });

    expect(chrome.logoSrc).toBe(
      "/clinic-branding/clinic_demo_rivers/11111111-1111-4111-8111-111111111111.webp"
    );
  });

  it("omits optional fields when they are missing or unsafe", () => {
    const chrome = resolvePracticeChrome({
      slug: "otherclinic",
      name: "Other Clinic",
      profile: {
        displayName: "Other Clinic Patient Brand",
        logoUrl: "https://evil.test/logo.png",
        phone: null,
        bookingUrl: "javascript:alert(1)",
        contactUrl: null,
        emergencyInstructions: "   ",
        showCareGuideAttribution: false,
      },
    });

    expect(chrome.displayName).toBe("Other Clinic Patient Brand");
    expect(chrome.logoSrc).toBeNull();
    expect(chrome.phoneHref).toBeNull();
    expect(chrome.bookingHref).toBeNull();
    expect(chrome.contactHref).toBeNull();
    expect(chrome.emergencyInstructions).toBeNull();
    expect(chrome.addressText).toBeNull();
    expect(chrome.showCareGuideAttribution).toBe(false);
    expect(chrome.showDemoNotice).toBe(false);
  });

  it("falls back to the clinic name when the profile is missing", () => {
    const chrome = resolvePracticeChrome({
      slug: "otherclinic",
      name: "Other Clinic",
      profile: null,
    });

    expect(chrome.displayName).toBe("Other Clinic");
    expect(chrome.showCareGuideAttribution).toBe(false);
    expect(chrome.showDemoNotice).toBe(false);
    expect(chrome.instructionTerminology).toBe("AFTERCARE");
    expect(chrome.allowPatientThemeToggle).toBe(false);
    expect(chrome.addressText).toBeNull();
  });

  it("formats clinic address for printable contact details", () => {
    const chrome = resolvePracticeChrome({
      slug: "demodental",
      name: "Rivers Care Demo Clinic",
      profile: {
        ...PROFILE,
        addressLine1: "12 Riverside Demo Street",
        city: "Sydney",
        region: "NSW",
        postalCode: "2000",
      },
    });

    expect(chrome.addressText).toBe(
      "12 Riverside Demo Street, Sydney NSW 2000"
    );
  });

  it("maps clinic terminology, theme policy, and the patient toggle flag", () => {
    const chrome = resolvePracticeChrome({
      slug: "demodental",
      name: "Rivers Care Demo Clinic",
      profile: {
        ...PROFILE,
        instructionTerminology: "POST_TREATMENT",
        themeMode: "DARK",
        allowPatientThemeToggle: true,
      },
    });

    expect(chrome.instructionTerminology).toBe("POST_TREATMENT");
    expect(chrome.instructionsLabel).toBe("Post-treatment instructions");
    expect(chrome.themeMode).toBe("DARK");
    expect(chrome.allowPatientThemeToggle).toBe(true);
  });

  it("keeps bookingHref for later configuration even though the CTA is not rendered", () => {
    const chrome = resolvePracticeChrome({
      slug: "demodental",
      name: "Rivers Care Demo Clinic",
      profile: {
        ...PROFILE,
        phone: null,
        contactUrl: null,
        emergencyInstructions: null,
      },
    });

    expect(chrome.bookingHref).toBe(
      "https://www.example.com/riverside-dental-demo/book"
    );
    expect(chrome.phoneHref).toBeNull();
    expect(chrome.contactHref).toBeNull();
  });
});
