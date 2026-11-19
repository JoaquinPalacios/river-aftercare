"use client";

import {
  ONBOARDING_ASSISTANCE_BODY,
  ONBOARDING_ASSISTANCE_CTA,
  ONBOARDING_ASSISTANCE_TITLE,
  onboardingAssistanceContactHref,
  type OnboardingAssistanceStage,
} from "@/lib/support/onboarding-assistance";

export function OnboardingAssistance({
  stage,
  contactHref,
}: {
  stage: OnboardingAssistanceStage;
  contactHref: string;
}) {
  return (
    <aside className="mt-6 rounded-2xl border border-staff-line bg-staff-canvas px-4 py-4 sm:px-5">
      <h2 className="text-base font-semibold text-staff-ink">
        {ONBOARDING_ASSISTANCE_TITLE}
      </h2>
      <p className="mt-2 text-sm leading-6 text-staff-muted">
        {ONBOARDING_ASSISTANCE_BODY}
      </p>
      <a
        href={onboardingAssistanceContactHref(contactHref, stage)}
        className="staffBtn mt-4 inline-flex min-h-11 items-center"
      >
        {ONBOARDING_ASSISTANCE_CTA}
      </a>
    </aside>
  );
}
