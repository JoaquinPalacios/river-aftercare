export const ONBOARDING_ASSISTANCE_STAGES = [
  "registration",
  "email_verification",
  "billing_setup",
  "clinic_configuration",
] as const;

export type OnboardingAssistanceStage =
  (typeof ONBOARDING_ASSISTANCE_STAGES)[number];

export const ONBOARDING_ASSISTANCE_TITLE = "Need help getting started?";

export const ONBOARDING_ASSISTANCE_BODY =
  "Prefer a little guidance? Request complimentary onboarding assistance and we'll help you set up River Aftercare for your practice.";

export const ONBOARDING_ASSISTANCE_CTA = "Request onboarding help";

const STAGE_LABEL: Record<OnboardingAssistanceStage, string> = {
  registration: "registration",
  email_verification: "email verification",
  billing_setup: "billing setup",
  clinic_configuration: "initial clinic setup",
};

export function isOnboardingAssistanceStage(
  value: string
): value is OnboardingAssistanceStage {
  return (ONBOARDING_ASSISTANCE_STAGES as readonly string[]).includes(value);
}

/**
 * Fixed stage note for the existing contact form. It does not accept a
 * practice name, email, password, token, or payment detail.
 */
export function onboardingAssistanceMessage(
  stage: OnboardingAssistanceStage
): string {
  return `Onboarding assistance request. Stage: ${STAGE_LABEL[stage]}.`;
}

export function onboardingAssistanceStageFromHash(
  hash: string
): OnboardingAssistanceStage | null {
  const trimmed = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!trimmed || trimmed.startsWith("?")) {
    return null;
  }
  const stage = new URLSearchParams(trimmed).get("onboarding-stage");
  if (!stage || !isOnboardingAssistanceStage(stage)) {
    return null;
  }
  return stage;
}

export function onboardingAssistanceContactHref(
  contactHref: string,
  stage: OnboardingAssistanceStage
): string {
  const url = new URL(contactHref);
  url.hash = `onboarding-stage=${stage}`;
  return url.href;
}
