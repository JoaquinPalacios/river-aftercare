export type BulkTemplateAction =
  "publish" | "deactivate" | "reactivate" | "delete";

export interface BulkTemplateRow {
  id: string;
  title: string;
  isActive: boolean;
  isSample: boolean;
  latestPublishedVersion: number | null;
  draft: { id: string; version: number } | null;
}

export interface BulkActionAvailability {
  enabled: boolean;
  reason: string | null;
}

const ACTIONS: readonly BulkTemplateAction[] = [
  "publish",
  "deactivate",
  "reactivate",
  "delete",
];

type Block = "sample" | "inactive" | "active" | "no-draft" | "published";

/**
 * Structural eligibility for the bulk bar.
 * Publication content rules stay in the canonical lifecycle service.
 */
export function bulkTemplateActionAvailability(
  selected: readonly BulkTemplateRow[]
): Record<BulkTemplateAction, BulkActionAvailability> {
  const availability = {} as Record<BulkTemplateAction, BulkActionAvailability>;
  for (const action of ACTIONS) {
    availability[action] = availabilityFor(action, selected);
  }
  return availability;
}

function availabilityFor(
  action: BulkTemplateAction,
  selected: readonly BulkTemplateRow[]
): BulkActionAvailability {
  if (selected.length === 0) {
    return { enabled: false, reason: null };
  }
  const counts = new Map<Block, number>();
  for (const template of selected) {
    const block = blockingCondition(action, template);
    if (!block) {
      continue;
    }
    counts.set(block, (counts.get(block) ?? 0) + 1);
  }
  if (counts.size === 0) {
    return { enabled: true, reason: null };
  }
  const phrases = [...counts.entries()].map(([block, count]) =>
    blockPhrase(action, block, count)
  );
  const label = actionLabel(action);
  return {
    enabled: false,
    reason: `${label} unavailable — ${phrases.join(" and ")}.`,
  };
}

function blockingCondition(
  action: BulkTemplateAction,
  template: BulkTemplateRow
): Block | null {
  if (template.isSample) {
    return "sample";
  }
  if (action === "publish") {
    if (!template.isActive) {
      return "inactive";
    }
    if (!template.draft) {
      return "no-draft";
    }
    return null;
  }
  if (action === "deactivate") {
    return template.isActive ? null : "inactive";
  }
  if (action === "reactivate") {
    return template.isActive ? "active" : null;
  }
  if (template.latestPublishedVersion !== null) {
    return "published";
  }
  if (!template.draft) {
    return "no-draft";
  }
  return null;
}

function actionLabel(action: BulkTemplateAction): string {
  if (action === "publish") {
    return "Publish";
  }
  if (action === "deactivate") {
    return "Deactivate";
  }
  if (action === "reactivate") {
    return "Reactivate";
  }
  return "Delete";
}

function countNoun(count: number): string {
  return count === 1 ? "1 selected template" : `${count} selected templates`;
}

function blockPhrase(
  action: BulkTemplateAction,
  block: Block,
  count: number
): string {
  const noun = countNoun(count);
  if (block === "sample") {
    return count === 1 ? `${noun} is a sample` : `${noun} are samples`;
  }
  if (block === "inactive") {
    return action === "deactivate"
      ? count === 1
        ? `${noun} is already inactive`
        : `${noun} are already inactive`
      : count === 1
        ? `${noun} is inactive`
        : `${noun} are inactive`;
  }
  if (block === "active") {
    return count === 1
      ? `${noun} is already active`
      : `${noun} are already active`;
  }
  if (block === "no-draft") {
    return count === 1
      ? `${noun} has no open draft`
      : `${noun} have no open draft`;
  }
  return count === 1
    ? `${noun} has a published revision`
    : `${noun} have published revisions`;
}
