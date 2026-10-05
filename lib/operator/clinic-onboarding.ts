import "server-only";

import { ClinicMembershipRole } from "@prisma/client";

import {
  serviceCategoryLabel,
  uniqueServiceCategories,
  type ServiceCategory,
} from "@/lib/aftercare/service-category";
import {
  initialCommercialSetupIsValid,
  loadOnboardingCommercial,
  type OnboardingCommercialState,
} from "@/lib/billing/onboarding-commercial";
import { publicPracticeName } from "@/lib/clinics/patient-profile";
import {
  listClinicTeam,
  type ClinicTeam,
} from "@/lib/operator/list-clinic-team";
import { getPrisma } from "@/lib/prisma";

export const COMMERCIAL_SETUP_REQUIRED_MESSAGE =
  "Set this clinic's commercial access before inviting someone.";

export { initialCommercialSetupIsValid };
export type { OnboardingCommercialState };

export type OnboardingAdministratorState =
  | { state: "not_invited" }
  | {
      state: "invited";
      userId: string;
      name: string | null;
      email: string;
      invitationStatus: "pending" | "expired";
    }
  | {
      state: "accepted";
      name: string | null;
      email: string;
      active: boolean;
    };

export type ClinicOnboardingSnapshot = {
  clinicId: string;
  clinicName: string;
  accountName: string;
  slug: string;
  assistedOnboarding: boolean;
  serviceCategories: ServiceCategory[];
  categoryLabels: string[];
  commercial: OnboardingCommercialState;
  administrator: OnboardingAdministratorState;
  negotiatedOfferOpen: boolean;
  readyForClinicSetup: boolean;
};

export type OnboardingProgressItem = {
  id: "clinic" | "categories" | "commercial" | "administrator" | "ready";
  label: string;
  complete: boolean;
};

type OnboardingClinicRecord = {
  id: string;
  name: string;
  slug: string;
  assistedOnboarding: boolean;
  sites: Array<{
    displayName: string | null;
    clinicId: string;
    serviceCategories: Array<{ serviceCategory: ServiceCategory }>;
  }>;
};

export function deriveClinicOnboarding(input: {
  clinic: OnboardingClinicRecord;
  team: ClinicTeam | null;
  commercial: OnboardingCommercialState;
  negotiatedOfferOpen: boolean;
}): ClinicOnboardingSnapshot {
  const primary =
    input.clinic.sites.length === 1 &&
    input.clinic.sites[0]?.clinicId === input.clinic.id
      ? input.clinic.sites[0]
      : null;
  const serviceCategories = uniqueServiceCategories(
    (primary?.serviceCategories ?? []).map((row) => row.serviceCategory)
  );
  const administrator = administratorState(input.team);
  const invitationUsable =
    administrator.state === "invited" &&
    administrator.invitationStatus === "pending";
  const administratorJoined = administrator.state === "accepted";
  return {
    clinicId: input.clinic.id,
    clinicName: publicPracticeName({
      siteDisplayName: primary?.displayName,
      accountName: input.clinic.name,
    }),
    accountName: input.clinic.name,
    slug: input.clinic.slug,
    assistedOnboarding: input.clinic.assistedOnboarding,
    serviceCategories,
    categoryLabels: serviceCategories.map(
      (category) => serviceCategoryLabel(category) ?? category
    ),
    commercial: input.commercial,
    administrator,
    negotiatedOfferOpen: input.negotiatedOfferOpen,
    readyForClinicSetup:
      input.commercial.configured && (invitationUsable || administratorJoined),
  };
}

function administratorState(
  team: ClinicTeam | null
): OnboardingAdministratorState {
  const adminMember = team?.rows.find(
    (row) => row.kind === "member" && row.role === ClinicMembershipRole.ADMIN
  );
  if (adminMember && adminMember.kind === "member") {
    return {
      state: "accepted",
      name: adminMember.name,
      email: adminMember.email,
      active: adminMember.status === "active",
    };
  }
  const adminInvite = team?.rows.find(
    (row) =>
      row.kind === "invitation" && row.role === ClinicMembershipRole.ADMIN
  );
  if (adminInvite && adminInvite.kind === "invitation") {
    return {
      state: "invited",
      userId: adminInvite.userId,
      name: adminInvite.name,
      email: adminInvite.email,
      invitationStatus: adminInvite.status,
    };
  }
  return { state: "not_invited" };
}

export function onboardingProgress(
  snapshot: ClinicOnboardingSnapshot
): OnboardingProgressItem[] {
  const categoriesSelected = snapshot.serviceCategories.length > 0;
  const administratorComplete =
    snapshot.administrator.state === "accepted" ||
    (snapshot.administrator.state === "invited" &&
      snapshot.administrator.invitationStatus === "pending");
  return [
    { id: "clinic", label: "Clinic created", complete: true },
    {
      id: "categories",
      label: "Practice categories selected",
      complete: categoriesSelected,
    },
    {
      id: "commercial",
      label: "Commercial arrangement",
      complete: snapshot.commercial.configured,
    },
    {
      id: "administrator",
      label: "Administrator",
      complete: administratorComplete,
    },
    {
      id: "ready",
      label: "Ready for clinic setup",
      complete: snapshot.readyForClinicSetup,
    },
  ];
}

export function ownerHandoffSteps(
  snapshot: ClinicOnboardingSnapshot
): string[] {
  const steps: string[] = [];
  if (
    snapshot.administrator.state === "invited" &&
    snapshot.administrator.invitationStatus === "expired"
  ) {
    steps.push(
      "Resend the invitation. The previous link has expired and cannot be used."
    );
  } else if (snapshot.administrator.state === "accepted") {
    steps.push(
      "The administrator already has a clinic membership and signs in with the password they chose."
    );
  } else {
    steps.push("Accept the invitation and choose a password.");
  }

  if (
    snapshot.commercial.configured &&
    snapshot.commercial.kind === "complimentary"
  ) {
    steps.push(
      "Open the clinic. Complimentary access follows the existing entitlement."
    );
    if (snapshot.negotiatedOfferOpen) {
      steps.push(
        "Accept the negotiated terms and authorise payment in Account billing. Complimentary access stays until that payment is confirmed."
      );
    }
  } else if (snapshot.commercial.configured) {
    steps.push(
      "Accept the current legal terms and authorise payment in Account billing. This operator step does not start Checkout."
    );
    steps.push("Product access begins after payment is confirmed.");
  }

  steps.push(
    "Published templates for the selected practice categories appear under Create guide. Sample and demo templates are not listed."
  );
  return steps;
}

export function administratorStatusLabel(
  administrator: OnboardingAdministratorState
): string {
  if (administrator.state === "not_invited") {
    return "Not invited";
  }
  if (administrator.state === "accepted") {
    return administrator.active ? "Joined" : "Membership inactive";
  }
  return administrator.invitationStatus === "expired"
    ? "Invitation expired"
    : "Invitation pending";
}

export async function loadClinicOnboarding(
  clinicId: string,
  now: Date = new Date()
): Promise<ClinicOnboardingSnapshot | null> {
  const prisma = getPrisma();
  const [clinic, commercial] = await Promise.all([
    prisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        id: true,
        name: true,
        slug: true,
        assistedOnboarding: true,
        sites: {
          where: { isPrimary: true, active: true },
          select: {
            displayName: true,
            clinicId: true,
            serviceCategories: {
              select: { serviceCategory: true },
            },
          },
        },
      },
    }),
    loadOnboardingCommercial(clinicId),
  ]);
  if (!clinic) {
    return null;
  }
  const team = await listClinicTeam(clinicId, now);
  return deriveClinicOnboarding({
    clinic,
    team,
    commercial: commercial.commercial,
    negotiatedOfferOpen: commercial.negotiatedOfferOpen,
  });
}

export async function assistedClinicNeedsCommercialSetup(
  clinicId: string
): Promise<boolean> {
  const clinic = await getPrisma().clinic.findUnique({
    where: { id: clinicId },
    select: {
      assistedOnboarding: true,
      entitlement: {
        select: {
          commercialPlan: true,
          commercialArrangement: true,
        },
      },
    },
  });
  if (!clinic?.assistedOnboarding) {
    return false;
  }
  return !initialCommercialSetupIsValid(clinic.entitlement);
}
