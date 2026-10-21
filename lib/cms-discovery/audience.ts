import type {
  CmsDiscoveryAudience,
  CmsDiscoveryContext,
  CmsDiscoveryStep,
} from "@/lib/cms-discovery/types";

export function audienceMatches(
  audience: CmsDiscoveryAudience,
  context: CmsDiscoveryContext
): boolean {
  if (context.assisting && audience.includeAssisting !== true) {
    return false;
  }

  if (audience.roles && !audience.roles.includes(context.role)) {
    return false;
  }

  for (const requirement of audience.requires ?? []) {
    if (!context.requirements[requirement]) {
      return false;
    }
  }

  return true;
}

export function stepMatches(
  step: CmsDiscoveryStep,
  context: CmsDiscoveryContext
): boolean {
  for (const requirement of step.requires ?? []) {
    if (!context.requirements[requirement]) {
      return false;
    }
  }

  return true;
}
