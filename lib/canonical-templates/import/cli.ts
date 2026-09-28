import "server-only";

import {
  CANONICAL_TEMPLATE_IMPORT_HELP,
  parseCanonicalTemplateImportArgs,
} from "@/lib/canonical-templates/import/args";
import {
  assertCanonicalImportApplyAllowed,
  classifyCanonicalImportTarget,
} from "@/lib/canonical-templates/import/database-guard";
import { isCanonicalTemplateImportError } from "@/lib/canonical-templates/import/errors";
import {
  collectCanonicalImportFiles,
  parseCanonicalImportJson,
} from "@/lib/canonical-templates/import/files";
import {
  formatCanonicalImportApplyBanner,
  formatCanonicalImportDryRunLine,
  formatCanonicalTemplateImportReport,
  formatCanonicalTemplateImportSummary,
} from "@/lib/canonical-templates/import/format-import-report";
import { importCanonicalTemplateFiles } from "@/lib/canonical-templates/import/import-canonical-template-draft";
import { getPrisma } from "@/lib/prisma";

function payloadIntent(text: string | null, error: string | null): string {
  if (error || text === null) {
    return "(unreadable)";
  }
  try {
    const value = parseCanonicalImportJson(text);
    if (!value || typeof value !== "object") {
      return "(invalid JSON)";
    }
    const record = value as {
      mode?: unknown;
      template?: { slug?: unknown };
    };
    const mode = typeof record.mode === "string" ? record.mode : "unknown";
    const slug =
      typeof record.template?.slug === "string"
        ? record.template.slug
        : "unknown";
    return `${slug} (${mode})`;
  } catch {
    return "(invalid JSON)";
  }
}

export async function runCanonicalTemplateImportCli(
  argv: readonly string[]
): Promise<number> {
  let connected = false;
  try {
    const options = parseCanonicalTemplateImportArgs(argv);
    if (options.help) {
      console.log(CANONICAL_TEMPLATE_IMPORT_HELP);
      return 0;
    }

    const target = classifyCanonicalImportTarget(process.env.DATABASE_URL);
    assertCanonicalImportApplyAllowed({
      target,
      apply: options.apply,
      allowProduction: options.allowProduction,
      confirmDraftImport: options.confirmDraftImport,
    });
    if (!options.apply) {
      console.log(formatCanonicalImportDryRunLine(target.label));
      console.log("");
    } else if (target.kind === "remote") {
      if (!options.operatorEmail) {
        throw new Error(
          "Apply requires --operator-email for an existing Operator. Import does not choose an actor."
        );
      }
      const files = await collectCanonicalImportFiles(options.targets);
      console.log(
        formatCanonicalImportApplyBanner({
          label: target.label,
          operatorEmail: options.operatorEmail,
          intents: files.map((file) => payloadIntent(file.text, file.error)),
        })
      );
      console.log("");
    } else {
      console.log(`Target: ${target.label}`);
      console.log("Mode: APPLY — DRAFTS ONLY");
      console.log("");
    }
    connected = true;
    const reports = await importCanonicalTemplateFiles({
      targets: options.targets,
      apply: options.apply,
      operatorEmail: options.operatorEmail,
    });
    for (const report of reports) {
      console.log(formatCanonicalTemplateImportReport(report));
      console.log("");
    }
    console.log(formatCanonicalTemplateImportSummary(reports));
    return reports.some(
      (report) => report.outcome === "invalid" || report.outcome === "failed"
    )
      ? 1
      : 0;
  } catch (error) {
    const message = isCanonicalTemplateImportError(error)
      ? error.message
      : error instanceof Error
        ? error.message
        : "Canonical template import failed.";
    console.error(message);
    return 1;
  } finally {
    if (connected) {
      await getPrisma()
        .$disconnect()
        .catch(() => undefined);
    }
  }
}
