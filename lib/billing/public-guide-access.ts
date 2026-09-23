import "server-only";

import { EntitlementStatus } from "@prisma/client";

import { getPrisma } from "@/lib/prisma";

/**
 * Request-time public guide retention.
 * There is no scheduler. Legacy clinics and every non-ended entitlement,
 * including unpaid RESTRICTED, keep already-published guides. An ended
 * subscription keeps them until publicGuideRetentionUntil. Drafts stay
 * unpublished because the published-guide predicate is unchanged.
 */
export function patientGuidesRemainPublic(input: {
  entitlementStatus: EntitlementStatus | null;
  publicGuideRetentionUntil: Date | null;
  now: Date;
}): boolean {
  if (input.entitlementStatus !== EntitlementStatus.ENDED) {
    return true;
  }
  if (!input.publicGuideRetentionUntil) {
    return true;
  }
  return input.now.getTime() <= input.publicGuideRetentionUntil.getTime();
}

export async function publishedPatientGuidesRemainPublic(
  clinicId: string,
  now: Date = new Date()
): Promise<boolean> {
  const entitlement = await getPrisma().clinicEntitlement.findUnique({
    where: { clinicId },
    select: {
      entitlementStatus: true,
      publicGuideRetentionUntil: true,
    },
  });
  return patientGuidesRemainPublic({
    entitlementStatus: entitlement?.entitlementStatus ?? null,
    publicGuideRetentionUntil: entitlement?.publicGuideRetentionUntil ?? null,
    now,
  });
}
