import { CanonicalTemplateImportError } from "@/lib/canonical-templates/import/errors";

export interface CanonicalTemplateImportCliOptions {
  help: boolean;
  apply: boolean;
  allowProduction: boolean;
  confirmDraftImport: boolean;
  operatorEmail: string | null;
  targets: string[];
}

export const CANONICAL_TEMPLATE_IMPORT_HELP = `Import canonical template drafts. Dry-run is the default.

Import creates or fills DRAFT revisions only. It cannot record review or
publish. After a successful apply, review and publish in Operator Templates.

Production import creates drafts only. Clinical review and publication still
happen in Operator Templates.

Usage:
  pnpm canonical-template:import -- <file-or-directory>...
  pnpm canonical-template:import -- --operator-email operator@example.com <file>
  pnpm canonical-template:import -- --apply --operator-email operator@example.com <file>
  pnpm canonical-template:import -- --apply --allow-production --confirm-draft-import --operator-email operator@example.com <file>

Options:
  --dry-run                 Validate and report. This is the default.
  --apply                   Write draft content. Requires --operator-email.
  --operator-email <email>  Existing user with platformRole OPERATOR.
  --allow-production        Required, with --confirm-draft-import, for a remote or production apply.
  --confirm-draft-import    Required, with --allow-production, for a remote or production apply.
  --help                    Show this help.

A local database is a loopback host when VERCEL_ENV is not production or preview.
Every other target is PRODUCTION / REMOTE. Dry-run may read it. --apply alone
does not write to it.

Modes in the JSON payload: create, create-revision, update-draft.
There is no upsert. A directory imports its .json files in filename order.
Each file is its own transaction. Schema version 1 is required.
`;

function readEmail(value: string | undefined): string {
  const email = value?.trim() ?? "";
  if (!email || email.startsWith("--")) {
    throw new CanonicalTemplateImportError(
      "Provide an email after --operator-email.",
      "usage"
    );
  }
  return email;
}

export function parseCanonicalTemplateImportArgs(
  argv: readonly string[]
): CanonicalTemplateImportCliOptions {
  let apply = false;
  let dryRun = false;
  let help = false;
  let allowProduction = false;
  let confirmDraftImport = false;
  let operatorEmail: string | null = null;
  const targets: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--") {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--allow-production") {
      allowProduction = true;
      continue;
    }
    if (arg === "--confirm-draft-import") {
      confirmDraftImport = true;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--operator-email") {
      if (operatorEmail) {
        throw new CanonicalTemplateImportError(
          "Pass --operator-email once.",
          "usage"
        );
      }
      operatorEmail = readEmail(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith("--operator-email=")) {
      if (operatorEmail) {
        throw new CanonicalTemplateImportError(
          "Pass --operator-email once.",
          "usage"
        );
      }
      operatorEmail = readEmail(arg.slice("--operator-email=".length));
      continue;
    }
    if (arg.startsWith("--")) {
      throw new CanonicalTemplateImportError(
        `Unknown argument ${arg}. Import cannot review or publish.`,
        "usage"
      );
    }
    targets.push(arg);
  }

  if (apply && dryRun) {
    throw new CanonicalTemplateImportError(
      "Use either --apply or --dry-run, not both.",
      "usage"
    );
  }
  if (!help && targets.length === 0) {
    throw new CanonicalTemplateImportError(
      "Provide at least one JSON file or directory.",
      "usage"
    );
  }

  return {
    help,
    apply,
    allowProduction,
    confirmDraftImport,
    operatorEmail,
    targets,
  };
}
