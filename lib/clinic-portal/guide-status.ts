import { GuideRevisionStatus, PracticeGuideStatus } from "@prisma/client";

export type ClinicGuideLifecycleStatus =
  | "draft"
  | "published"
  | "published_disabled"
  | "published_draft_changes"
  | "unpublished";

export type GuideStatusPillTone =
  | "draft"
  | "published"
  | "changes"
  | "disabled"
  | "unpublished"
  | "warning"
  | "inactive";

export interface GuideStatusPill {
  label: string;
  tone: GuideStatusPillTone;
}

export type GuideDestructiveAction = "delete_guide" | "discard_draft_changes";

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

export function clinicGuideStatusPills(
  status: ClinicGuideLifecycleStatus
): GuideStatusPill[] {
  switch (status) {
    case "published":
      return [{ label: "Published", tone: "published" }];
    case "published_disabled":
      return [
        { label: "Published", tone: "published" },
        { label: "Disabled", tone: "disabled" },
      ];
    case "published_draft_changes":
      return [
        { label: "Published", tone: "published" },
        { label: "Draft changes", tone: "changes" },
      ];
    case "unpublished":
      return [{ label: "Unpublished", tone: "unpublished" }];
    default:
      return [{ label: "Draft", tone: "draft" }];
  }
}

export function clinicGuideStatusLabel(
  status: ClinicGuideLifecycleStatus
): string {
  return clinicGuideStatusPills(status)
    .map((pill) => pill.label)
    .join(" · ");
}

export function clinicGuideDestructiveAction(
  status: ClinicGuideLifecycleStatus
): GuideDestructiveAction | null {
  switch (status) {
    case "draft":
    case "unpublished":
      return "delete_guide";
    case "published_draft_changes":
      return "discard_draft_changes";
    default:
      return null;
  }
}

export function clinicGuideCanUnpublish(
  status: ClinicGuideLifecycleStatus
): boolean {
  return (
    status === "published" ||
    status === "published_draft_changes" ||
    status === "published_disabled"
  );
}

/**
 * Editor publication controls.
 * A clean published guide offers Unpublish. Publish stays available when the
 * guide is not public yet, or when a published guide has edits to release.
 */
export function guideEditorPublicationMode(input: {
  lifecycle: ClinicGuideLifecycleStatus;
  dirty: boolean;
}): { publish: boolean; unpublish: boolean } {
  if (input.lifecycle === "draft" || input.lifecycle === "unpublished") {
    return { publish: true, unpublish: false };
  }
  if (input.lifecycle === "published" && !input.dirty) {
    return { publish: false, unpublish: true };
  }
  return { publish: true, unpublish: true };
}
