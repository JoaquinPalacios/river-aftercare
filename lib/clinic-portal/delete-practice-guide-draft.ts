import { PracticeGuideStatus } from "@prisma/client";

import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { assertPracticeGuideWritable } from "@/lib/clinic-portal/retained-guide-guard";
import { getPrisma } from "@/lib/prisma";

export async function deletePracticeGuide(input: {
  clinicId: string;
  actorUserId: string;
  guideId: string;
}): Promise<{ id: string }> {
  const guide = await getPrisma().practiceGuide.findFirst({
    where: {
      id: input.guideId,
      clinicId: input.clinicId,
    },
    select: {
      id: true,
      status: true,
      guideTemplateId: true,
      downgradeRetainedAt: true,
    },
  });

  if (!guide) {
    throw new ClinicPortalError("Guide not found.", "not_found");
  }

  assertPracticeGuideWritable(guide);

  if (guide.status === PracticeGuideStatus.PUBLISHED) {
    throw new ClinicPortalError(
      "Unpublish this guide before deleting it.",
      "conflict"
    );
  }

  const deleted = await getPrisma().practiceGuide.deleteMany({
    where: {
      id: guide.id,
      clinicId: input.clinicId,
      status: { not: PracticeGuideStatus.PUBLISHED },
    },
  });

  if (deleted.count !== 1) {
    throw new ClinicPortalError("Guide not found.", "not_found");
  }

  return { id: guide.id };
}
