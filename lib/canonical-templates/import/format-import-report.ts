import {
  isServiceCategory,
  serviceCategoryLabel,
} from "@/lib/aftercare/service-category";

import type { CanonicalTemplateImportReport } from "@/lib/canonical-templates/import/types";

function presence(value: boolean, inspected: boolean): string {
  if (!inspected) {
    return "unknown";
  }
  return value ? "yes" : "no";
}

function versionLabel(version: number | null, inspected: boolean): string {
  if (!inspected) {
    return "unknown";
  }
  return version === null ? "none" : `v${version}`;
}

function listOrNone(label: string, items: string[]): string[] {
  if (items.length === 0) {
    return [`${label}: none`];
  }
  return [label + ":", ...items.map((item) => `- ${item}`)];
}

export function formatCanonicalTemplateImportReport(
  report: CanonicalTemplateImportReport
): string {
  const service = report.serviceCategory
    ? isServiceCategory(report.serviceCategory)
      ? serviceCategoryLabel(report.serviceCategory)
      : report.serviceCategory
    : "unknown";
  const lines = [
    report.sourceLabel ? `File: ${report.sourceLabel}` : null,
    `Template: ${report.title ?? "unknown"}`,
    `Slug: ${report.slug ?? "unknown"}`,
    `Service: ${service ?? "unknown"}`,
    `Mode: ${report.modeLabel ?? "unknown"}`,
    `Sections: ${report.sectionCount ?? "unknown"}`,
    `Home-care instructions: ${report.homeCareInstructionCount ?? "unknown"}`,
    `Schema: ${report.schemaValid ? "valid" : "invalid"}`,
    `Template exists: ${presence(report.templateExists, report.inspected)}`,
    `Open draft: ${presence(report.openDraftExists, report.inspected)}`,
    `Latest published version: ${versionLabel(report.latestPublishedVersion, report.inspected)}`,
    `Intended draft version: ${versionLabel(report.intendedDraftVersion, report.schemaValid && report.inspected)}`,
    ...listOrNone("Lifecycle conflicts", report.lifecycleConflicts),
    ...listOrNone("Validation errors", report.validationErrors),
  ].filter((line): line is string => Boolean(line));

  if (report.reviewNotice && report.outcome !== "applied") {
    lines.push(report.reviewNotice);
  }

  if (report.outcome === "valid") {
    lines.push("Result: VALID — no writes performed");
  } else if (report.outcome === "invalid") {
    lines.push("Result: INVALID — no writes performed");
  } else if (report.outcome === "applied") {
    lines.push("Result: APPLIED");
    lines.push(`Template ID: ${report.templateId ?? "unknown"}`);
    lines.push(
      `Draft revision: ${report.draftVersion === null ? "unknown" : `v${report.draftVersion}`}`
    );
    if (report.reviewCleared) {
      lines.push(
        "Review invalidated; the draft must be reviewed again before publication."
      );
    } else if (report.reviewKept) {
      lines.push("Recorded review was not invalidated.");
    } else {
      lines.push("Review: not recorded");
    }
    lines.push("Publication: not published");
  } else {
    lines.push(
      report.failurePersisted
        ? "Result: FAILED — inspect this template before retrying"
        : "Result: FAILED — no import persisted"
    );
    if (report.failureMessage) {
      lines.push(`Error: ${report.failureMessage}`);
    }
  }

  return lines.join("\n");
}

export function formatCanonicalImportDryRunLine(label: string): string {
  return `Target: ${label} — DRY RUN — NO WRITES`;
}

export function formatCanonicalImportApplyBanner(input: {
  label: string;
  operatorEmail: string;
  intents: readonly string[];
}): string {
  return [
    `Target: ${input.label}`,
    "Mode: APPLY — DRAFTS ONLY",
    `Operator: ${input.operatorEmail}`,
    `Payloads: ${input.intents.length}`,
    ...input.intents.map((intent) => `- ${intent}`),
  ].join("\n");
}

export function formatCanonicalTemplateImportSummary(
  reports: readonly CanonicalTemplateImportReport[]
): string {
  const count = (outcome: CanonicalTemplateImportReport["outcome"]) =>
    reports.filter((report) => report.outcome === outcome).length;
  return [
    `Payloads: ${reports.length}`,
    `Valid: ${count("valid")}`,
    `Applied: ${count("applied")}`,
    `Invalid: ${count("invalid")}`,
    `Failed: ${count("failed")}`,
  ].join("\n");
}
