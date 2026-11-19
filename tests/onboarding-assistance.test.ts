import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ONBOARDING_ASSISTANCE_BODY,
  ONBOARDING_ASSISTANCE_CTA,
  ONBOARDING_ASSISTANCE_TITLE,
  onboardingAssistanceContactHref,
  onboardingAssistanceMessage,
  onboardingAssistanceStageFromHash,
} from "@/lib/support/onboarding-assistance";

describe("onboarding assistance", () => {
  it("uses the public contact form and a fixed stage note", () => {
    const href = onboardingAssistanceContactHref(
      "https://riveraftercare.com.au/contact",
      "registration"
    );
    expect(href).toBe(
      "https://riveraftercare.com.au/contact#onboarding-stage=registration"
    );
    expect(
      onboardingAssistanceStageFromHash("#onboarding-stage=billing_setup")
    ).toBe("billing_setup");
    expect(
      onboardingAssistanceStageFromHash("#onboarding-stage=password")
    ).toBeNull();
    const message = onboardingAssistanceMessage("clinic_configuration");
    expect(message).toBe(
      "Onboarding assistance request. Stage: initial clinic setup."
    );
    expect(message).not.toMatch(/password|token|card|patient/i);
    expect(ONBOARDING_ASSISTANCE_TITLE).toBe("Need help getting started?");
    expect(ONBOARDING_ASSISTANCE_BODY).toContain(
      "Request complimentary onboarding assistance"
    );
    expect(ONBOARDING_ASSISTANCE_CTA).toBe("Request onboarding help");
  });

  it("stays available on billing setup and when clinic configuration begins", () => {
    const billing = readFileSync(
      "app/(staff)/account/billing/setup/page.tsx",
      "utf8"
    );
    expect(billing).toContain('stage="billing_setup"');
    expect(billing).toContain("OnboardingAssistance");
    const dashboard = readFileSync(
      "app/(staff)/(clinic-portal)/dashboard/page.tsx",
      "utf8"
    );
    expect(dashboard).toContain('stage="clinic_configuration"');
    const assistance = readFileSync(
      "app/(staff)/components/onboarding-assistance.tsx",
      "utf8"
    );
    expect(assistance).not.toMatch(/password|token|stripe/i);
  });
});
