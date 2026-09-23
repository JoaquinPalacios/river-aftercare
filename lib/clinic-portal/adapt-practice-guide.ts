import "server-only";

import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { decideTemplateAdaptation } from "@/lib/entitlements/guide-usage";
import { lockClinicGuideCapacity } from "@/lib/entitlements/locks";
import { ENTITLEMENT_CODES } from "@/lib/entitlements/messages";
import { getPrisma } from "@/lib/prisma";

/**
 * Converts a template-backed practice guide into a clinic-owned custom guide.
 * The canonical GuideTemplate is not changed. The clinic row stops pinning
 * the template, records the source, and then counts toward the custom-guide
 * allowance. Later edits use the normal custom-guide editor.
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
      },
    });
    if (!guide) {
      throw new ClinicPortalError("Guide not found.", "not_found");
    }
    if (!guide.guideTemplateId) {
      return { id: guide.id };
    }

    const decision = await decideTemplateAdaptation(tx, input.clinicId);
    if (!decision.ok) {
      throw new ClinicPortalError(
        decision.error,
        decision.code === ENTITLEMENT_CODES.CUSTOM_GUIDE_LIMIT_REACHED
          ? "custom_guide_limit"
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

    return { id: guide.id };
  });
}
