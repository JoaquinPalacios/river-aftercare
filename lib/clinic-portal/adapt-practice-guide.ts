import "server-only";

import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { ensureRootPlacement } from "@/lib/clinic-portal/root-placement";
import { assertPracticeGuideWritable } from "@/lib/clinic-portal/retained-guide-guard";
import { decideTemplateAdaptation } from "@/lib/entitlements/guide-usage";
import { lockClinicGuideCapacity } from "@/lib/entitlements/locks";
import { ENTITLEMENT_CODES } from "@/lib/entitlements/messages";
import { getPrisma } from "@/lib/prisma";

/**
 * Forks a pinned River template into a clinic-owned editable copy.
 * The canonical GuideTemplate and its revisions are not changed.
 * The clinic row clears the pin, records sourceGuideTemplateId and adaptedAt,
 * and consumes one adapted-template allowance. It does not consume an
 * original custom-guide place. Later edits stay on this copy.
 */
export async function adaptPracticeGuideFromTemplate(input: {
  clinicId: string;
  guideId: string;
  now?: Date;
}): Promise<{ id: string }> {
  const now = input.now ?? new Date();

  return getPrisma().$transaction(async (tx) => {
    await lockClinicGuideCapacity(tx, input.clinicId);
    const guide = await tx.practiceGuide.findFirst({
      where: {
        id: input.guideId,
        clinicId: input.clinicId,
      },
      select: {
        id: true,
        guideTemplateId: true,
        publicSlug: true,
        downgradeRetainedAt: true,
      },
    });
    if (!guide) {
      throw new ClinicPortalError("Guide not found.", "not_found");
    }
    assertPracticeGuideWritable(guide);
    if (!guide.guideTemplateId) {
      return { id: guide.id };
    }

    const decision = await decideTemplateAdaptation(tx, input.clinicId);
    if (!decision.ok) {
      throw new ClinicPortalError(
        decision.error,
        decision.code === ENTITLEMENT_CODES.ADAPTED_TEMPLATE_LIMIT_REACHED
          ? "adapted_template_limit"
          : decision.code === ENTITLEMENT_CODES.COMBINED_GUIDE_LIMIT_REACHED
            ? "combined_guide_limit"
            : "template_adaptation_unavailable"
      );
    }

    await tx.practiceGuide.update({
      where: { id: guide.id },
      data: {
        guideTemplateId: null,
        pinnedRevisionId: null,
        sourceGuideTemplateId: guide.guideTemplateId,
        adaptedAt: now,
      },
    });

    await ensureRootPlacement(tx, {
      clinicId: input.clinicId,
      practiceGuideId: guide.id,
      publicSlug: guide.publicSlug,
    });

    return { id: guide.id };
  });
}
