import type {
  CmsDiscoveryContext,
  CmsDiscoveryRole,
} from "@/lib/cms-discovery/types";

const ROLES = new Set<CmsDiscoveryRole>(["ADMIN", "STAFF"]);

export function buildCmsDiscoveryContext(input: {
  userId: string;
  role: string;
  assisting: boolean;
  productNav: boolean;
  canManagePractice: boolean;
  hasPatientSite: boolean;
  assistedOnboarding: boolean;
}): CmsDiscoveryContext | null {
  if (!ROLES.has(input.role as CmsDiscoveryRole)) {
    return null;
  }

  const userId = input.userId.trim();
  if (!userId) {
    return null;
  }

  return {
    userId,
    role: input.role as CmsDiscoveryRole,
    assisting: input.assisting,
    requirements: {
      productNav: input.productNav,
      canManagePractice: input.canManagePractice,
      hasPatientSite: input.hasPatientSite,
      assistedOnboarding: input.assistedOnboarding,
    },
  };
}
