import "server-only";

import { GuideRevisionStatus, PracticeGuideStatus } from "@prisma/client";

import type { ClinicGuideLifecycleStatus } from "@/lib/clinic-portal/guide-status-view";

export {
  clinicGuideCanUnpublish,
  clinicGuideDestructiveAction,
  clinicGuideStatusLabel,
  clinicGuideStatusPills,
  guideEditorPublicationMode,
} from "@/lib/clinic-portal/guide-status-view";
export type {
  ClinicGuideLifecycleStatus,
  GuideDestructiveAction,
  GuideStatusPill,
  GuideStatusPillTone,
} from "@/lib/clinic-portal/guide-status-view";

export function clinicGuideLifecycleStatus(input: {
  status: PracticeGuideStatus;
  isEnabled: boolean;
  publishedRevisionStatus?: GuideRevisionStatus | null;
  draftUpdatedAt?: Date | null;
  publishedAt?: Date | null;
}): ClinicGuideLifecycleStatus {
  if (input.status === PracticeGuideStatus.UNPUBLISHED) {
    return "unpublished";
  }

  if (input.status !== PracticeGuideStatus.PUBLISHED) {
    return "draft";
  }

  if (!input.isEnabled) {
    return "published_disabled";
  }

  if (
    input.publishedRevisionStatus === GuideRevisionStatus.PUBLISHED &&
    input.draftUpdatedAt &&
    input.publishedAt &&
    input.draftUpdatedAt.getTime() > input.publishedAt.getTime()
  ) {
    return "published_draft_changes";
  }

  return "published";
}
