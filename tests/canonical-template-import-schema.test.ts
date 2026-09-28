import { execFile } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { GUIDE_SECTION_KINDS } from "@/lib/aftercare/types";
import { parseCanonicalTemplateImportArgs } from "@/lib/canonical-templates/import/args";
import {
  CANONICAL_IMPORT_FORBIDDEN_IDENTITY_FIELDS,
  CANONICAL_IMPORT_FORBIDDEN_LIFECYCLE_FIELDS,
} from "@/lib/canonical-templates/import/constants";
import {
  assertCanonicalImportApplyAllowed,
  classifyCanonicalImportTarget,
} from "@/lib/canonical-templates/import/database-guard";
import { collectCanonicalImportFiles } from "@/lib/canonical-templates/import/files";
import {
  formatCanonicalImportApplyBanner,
  formatCanonicalImportDryRunLine,
  formatCanonicalTemplateImportReport,
} from "@/lib/canonical-templates/import/format-import-report";
import { validateCanonicalTemplateImportPayload } from "@/lib/canonical-templates/import/schema";
import type { CanonicalTemplateImportReport } from "@/lib/canonical-templates/import/types";

const execFileAsync = promisify(execFile);

function section(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    key: "introduction",
    kind: "INTRODUCTION",
    title: "Placeholder introduction",
    body: "Synthetic placeholder copy. This is not clinical guidance.",
    ...overrides,
  };
}

function payload(
  overrides: {
    mode?: string;
    template?: Record<string, unknown>;
    sections?: unknown[];
    schemaVersion?: unknown;
  } = {}
) {
  return {
    schemaVersion: "schemaVersion" in overrides ? overrides.schemaVersion : 1,
    mode: overrides.mode ?? "create",
    template: {
      title: "Example placeholder template",
      slug: "example-placeholder",
      serviceCategory: "PHYSIOTHERAPY",
      ...overrides.template,
    },
    revision: {
      sections: overrides.sections ?? [section()],
    },
  };
}

function homePlan() {
  return {
    key: "home-plan",
    kind: "HOME_CARE_PLAN",
    title: "Placeholder home plan",
    body: "",
    homeCareInstructions: [
      {
        key: "exercise-frequency",
        title: "Placeholder repeated action",
        body: "Synthetic instruction text.",
        frequencyCount: 2,
        frequencyPeriod: "WEEK",
        timingLabel: "Morning",
        durationValue: 2,
        durationUnit: "WEEKS",
      },
    ],
  };
}

function timeline(
  key: string,
  startDay: number,
  endDay: number
): Record<string, unknown> {
  return section({
    key,
    kind: "RECOVERY_TIMELINE",
    title: "Placeholder window",
    body: "Synthetic timeline stage. Not a treatment instruction.",
    periodLabel: "Placeholder window",
    startDay,
    endDay,
  });
}

function report(
  overrides: Partial<CanonicalTemplateImportReport> = {}
): CanonicalTemplateImportReport {
  return {
    sourceLabel: "example.json",
    schemaValid: true,
    modeLabel: "create",
    mode: "create",
    title: "Example placeholder template",
    slug: "example-placeholder",
    serviceCategory: "PHYSIOTHERAPY",
    sectionCount: 1,
    homeCareInstructionCount: 0,
    inspected: true,
    templateExists: false,
    openDraftExists: false,
    latestPublishedVersion: null,
    intendedDraftVersion: 1,
    lifecycleConflicts: [],
    validationErrors: [],
    reviewNotice: null,
    outcome: "valid",
    templateId: null,
    draftVersion: null,
    reviewCleared: false,
    reviewKept: false,
    failureMessage: null,
    failurePersisted: false,
    ...overrides,
  };
}

describe("canonical template import schema", () => {
  it("accepts a create payload, timeline content, and a home-care plan", () => {
    const parsed = validateCanonicalTemplateImportPayload(
      payload({
        sections: [section(), timeline("first-window", 0, 2), homePlan()],
      })
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.parsed?.mode).toBe("create");
    expect(parsed.parsed?.sections.map((item) => item.sortOrder)).toEqual([
      1, 2, 3,
    ]);
    expect(parsed.parsed?.sections[2]?.homeCareInstructions[0]?.sortOrder).toBe(
      1
    );
    expect(parsed.parsed?.sections[2]?.homeCareInstructions[0]?.key).toBe(
      "exercise-frequency"
    );
  });

  it("accepts every canonical section kind", () => {
    const sections = GUIDE_SECTION_KINDS.map((kind) => {
      if (kind === "HOME_CARE_PLAN") {
        return homePlan();
      }
      if (kind === "RECOVERY_TIMELINE") {
        return timeline("recovery-timeline", 0, 1);
      }
      return section({
        key: kind.toLowerCase().replaceAll("_", "-"),
        kind,
        title: `Placeholder ${kind}`,
      });
    });
    const parsed = validateCanonicalTemplateImportPayload(
      payload({ sections })
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.parsed?.sections).toHaveLength(GUIDE_SECTION_KINDS.length);
  });

  it("accepts the synthetic fixture", () => {
    const fixture = JSON.parse(
      readFileSync(
        "fixtures/canonical-template-import/example-physio.json",
        "utf8"
      )
    );
    const parsed = validateCanonicalTemplateImportPayload(fixture);
    expect(parsed.ok).toBe(true);
    expect(parsed.parsed?.template.serviceCategory).toBe("PHYSIOTHERAPY");
    expect(parsed.partial.sectionCount).toBe(3);
    expect(parsed.partial.homeCareInstructionCount).toBe(1);
  });

  it("rejects an invalid service category", () => {
    const parsed = validateCanonicalTemplateImportPayload(
      payload({ template: { serviceCategory: "DENTISTRY" } })
    );
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.join("\n")).toContain("Choose a service category.");
  });

  it("rejects duplicate section keys and duplicate home-care keys", () => {
    const duplicateSections = validateCanonicalTemplateImportPayload(
      payload({ sections: [section(), section({ title: "Second" })] })
    );
    expect(duplicateSections.errors.join("\n")).toContain(
      "Section keys must be unique."
    );

    const duplicateInstructions = validateCanonicalTemplateImportPayload(
      payload({
        sections: [
          {
            ...homePlan(),
            homeCareInstructions: [
              homePlan().homeCareInstructions[0],
              {
                ...homePlan().homeCareInstructions[0],
                title: "Another placeholder",
              },
            ],
          },
        ],
      })
    );
    expect(duplicateInstructions.errors.join("\n")).toContain(
      "Instruction keys must be unique."
    );
  });

  it("rejects an invalid timeline range and overlapping ranges", () => {
    const range = validateCanonicalTemplateImportPayload(
      payload({ sections: [timeline("first-window", 5, 1)] })
    );
    expect(range.errors.join("\n")).toContain(
      "The last day of a stage cannot be before its first day."
    );

    const overlap = validateCanonicalTemplateImportPayload(
      payload({
        sections: [
          timeline("first-window", 0, 2),
          timeline("next-window", 2, 4),
        ],
      })
    );
    expect(overlap.errors.join("\n")).toContain("cannot overlap");
  });

  it("rejects an incomplete recurrence pair", () => {
    const parsed = validateCanonicalTemplateImportPayload(
      payload({
        sections: [
          {
            ...homePlan(),
            homeCareInstructions: [
              {
                key: "exercise-frequency",
                title: "Placeholder repeated action",
                frequencyCount: 2,
              },
            ],
          },
        ],
      })
    );
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.join("\n")).toContain("Choose per day or per week.");
  });

  it("rejects unsupported schema versions without interpreting the payload", () => {
    const parsed = validateCanonicalTemplateImportPayload({
      schemaVersion: 2,
      mode: "publish",
      status: "PUBLISHED",
      template: {
        slug: "example-placeholder",
        serviceCategory: "DENTISTRY",
      },
    });
    expect(parsed.errors).toEqual([
      "Unsupported canonical template import schema version 2. This importer supports schema version 1 only and does not reinterpret other payloads.",
    ]);
    expect(parsed.partial.slug).toBeNull();
    expect(parsed.partial.modeLabel).toBeNull();

    const stringVersion = validateCanonicalTemplateImportPayload(
      payload({ schemaVersion: "1" })
    );
    expect(stringVersion.errors[0]).toContain('schema version "1"');
  });

  it("rejects upsert and publication modes", () => {
    expect(
      validateCanonicalTemplateImportPayload(payload({ mode: "upsert" }))
        .errors[0]
    ).toContain('Import mode "upsert" is not supported');
    expect(
      validateCanonicalTemplateImportPayload(payload({ mode: "publish" }))
        .errors[0]
    ).toContain("Import cannot review or publish");
  });

  it.each([
    ...CANONICAL_IMPORT_FORBIDDEN_LIFECYCLE_FIELDS,
    ...CANONICAL_IMPORT_FORBIDDEN_IDENTITY_FIELDS,
  ])("rejects forbidden field %s", (field) => {
    const value = payload();
    const parsed = validateCanonicalTemplateImportPayload({
      ...value,
      [field]: field === "isSample" || field === "isActive" ? true : "no",
    });
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.join("\n")).toContain(`"${field}"`);
  });

  it("rejects nested lifecycle fields and manual sort order", () => {
    const nested = validateCanonicalTemplateImportPayload(
      payload({
        sections: [section({ status: "PUBLISHED" })],
      })
    );
    expect(nested.errors.join("\n")).toContain('"status"');

    const ordered = validateCanonicalTemplateImportPayload(
      payload({ sections: [section({ sortOrder: 4 })] })
    );
    expect(ordered.errors.join("\n")).toContain("sortOrder");
  });

  it("rejects the extraction slug", () => {
    const parsed = validateCanonicalTemplateImportPayload(
      payload({ template: { slug: "extraction" } })
    );
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.join("\n")).toContain("extraction");
  });

  it("formats a dry-run and an applied draft report", () => {
    expect(formatCanonicalTemplateImportReport(report())).toContain(
      "Result: VALID — no writes performed"
    );
    expect(formatCanonicalTemplateImportReport(report())).toContain(
      "Service: Physiotherapy"
    );
    const applied = formatCanonicalTemplateImportReport(
      report({
        outcome: "applied",
        templateId: "template_1",
        draftVersion: 1,
        templateExists: true,
        openDraftExists: true,
      })
    );
    expect(applied).toContain("Result: APPLIED");
    expect(applied).toContain("Template ID: template_1");
    expect(applied).toContain("Draft revision: v1");
    expect(applied).toContain("Review: not recorded");
    expect(applied).toContain("Publication: not published");
  });

  it("parses CLI flags without a publish switch", () => {
    expect(
      parseCanonicalTemplateImportArgs(["fixtures/example.json"])
    ).toMatchObject({
      apply: false,
      allowProduction: false,
      confirmDraftImport: false,
      operatorEmail: null,
      targets: ["fixtures/example.json"],
    });
    expect(
      parseCanonicalTemplateImportArgs([
        "--apply",
        "--operator-email",
        "operator@example.com",
        "one.json",
      ])
    ).toMatchObject({
      apply: true,
      allowProduction: false,
      confirmDraftImport: false,
    });
    expect(
      parseCanonicalTemplateImportArgs([
        "--apply",
        "--allow-production",
        "--confirm-draft-import",
        "--operator-email",
        "operator@example.com",
        "one.json",
      ])
    ).toMatchObject({
      apply: true,
      allowProduction: true,
      confirmDraftImport: true,
    });
    expect(
      parseCanonicalTemplateImportArgs(["--", "fixtures/example.json"]).targets
    ).toEqual(["fixtures/example.json"]);
    expect(() =>
      parseCanonicalTemplateImportArgs(["--publish", "one.json"])
    ).toThrow(/Unknown argument --publish/);
    expect(() =>
      parseCanonicalTemplateImportArgs(["--apply", "--dry-run", "one.json"])
    ).toThrow(/not both/);
  });

  it("classifies local and remote targets and gates apply", () => {
    const local = classifyCanonicalImportTarget(
      "postgresql://postgres:postgres@localhost:5432/care_guide"
    );
    expect(local).toEqual({ kind: "local", label: "LOCAL" });
    const remote = classifyCanonicalImportTarget(
      "postgresql://user:secret@ep-example.neon.tech/care_guide"
    );
    expect(remote).toEqual({
      kind: "remote",
      label: "PRODUCTION / REMOTE",
    });
    expect(
      classifyCanonicalImportTarget(
        "postgresql://postgres:postgres@127.0.0.1:5432/care_guide",
        "production"
      ).kind
    ).toBe("remote");
    expect(
      classifyCanonicalImportTarget(
        "postgresql://postgres:postgres@localhost:5432/care_guide",
        "preview"
      ).kind
    ).toBe("remote");
    expect(() => classifyCanonicalImportTarget("")).toThrow(
      /DATABASE_URL is required/
    );

    expect(() =>
      assertCanonicalImportApplyAllowed({
        target: local,
        apply: true,
        allowProduction: false,
        confirmDraftImport: false,
      })
    ).not.toThrow();
    expect(() =>
      assertCanonicalImportApplyAllowed({
        target: remote,
        apply: false,
        allowProduction: false,
        confirmDraftImport: false,
      })
    ).not.toThrow();
    expect(() =>
      assertCanonicalImportApplyAllowed({
        target: remote,
        apply: true,
        allowProduction: false,
        confirmDraftImport: false,
      })
    ).toThrow(/--apply alone does not write/);
    expect(() =>
      assertCanonicalImportApplyAllowed({
        target: remote,
        apply: true,
        allowProduction: true,
        confirmDraftImport: false,
      })
    ).toThrow(/--confirm-draft-import/);
    expect(() =>
      assertCanonicalImportApplyAllowed({
        target: remote,
        apply: false,
        allowProduction: true,
        confirmDraftImport: true,
      })
    ).not.toThrow();
    expect(() =>
      assertCanonicalImportApplyAllowed({
        target: remote,
        apply: true,
        allowProduction: true,
        confirmDraftImport: true,
      })
    ).not.toThrow();
    expect(formatCanonicalImportDryRunLine(remote.label)).toBe(
      "Target: PRODUCTION / REMOTE — DRY RUN — NO WRITES"
    );
    const banner = formatCanonicalImportApplyBanner({
      label: remote.label,
      operatorEmail: "operator@example.com",
      intents: ["example-placeholder (create)"],
    });
    expect(banner).toContain("Target: PRODUCTION / REMOTE");
    expect(banner).toContain("Mode: APPLY — DRAFTS ONLY");
    expect(banner).toContain("Operator: operator@example.com");
    expect(banner).toContain("Payloads: 1");
    expect(banner).toContain("example-placeholder (create)");
    expect(banner).not.toContain("postgres://");
    expect(banner).not.toContain("postgresql://");
  });

  it("lists directory JSON files in filename order and keeps invalid files", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "cti-schema-"));
    await writeFile(path.join(directory, "b.json"), "{}\n");
    await writeFile(path.join(directory, "a.json"), "{}\n");
    await writeFile(path.join(directory, "notes.txt"), "not a payload\n");
    const files = await collectCanonicalImportFiles([directory]);
    expect(files.map((file) => path.basename(file.label))).toEqual([
      "a.json",
      "b.json",
    ]);

    const empty = await mkdtemp(path.join(tmpdir(), "cti-empty-"));
    await writeFile(path.join(empty, "notes.txt"), "skip\n");
    const missing = await collectCanonicalImportFiles([empty]);
    expect(missing[0]?.error).toContain("No JSON import payloads");
  });

  it("does not expose publish or an HTTP importer", () => {
    const importDir = "lib/canonical-templates/import";
    const source = readdirSync(importDir)
      .filter((name) => name.endsWith(".ts"))
      .map((name) => readFileSync(path.join(importDir, name), "utf8"))
      .join("\n");
    expect(source).toContain("createCanonicalTemplateInTransaction(");
    expect(source).toContain("createCanonicalTemplateDraftInTransaction(");
    expect(source).toContain("saveCanonicalTemplateDraftInTransaction(");
    expect(source).not.toContain("abandonCanonicalTemplateDraft");
    expect(source).not.toContain("publishCanonicalTemplateRevision");
    expect(source).not.toContain("recordCanonicalTemplateReview");
    expect(source).not.toContain("guideTemplate.create");
    expect(source).not.toContain("guideTemplateRevision.create");

    function walk(directory: string): string[] {
      return readdirSync(directory, { withFileTypes: true }).flatMap(
        (entry) => {
          const fullPath = path.join(directory, entry.name);
          if (entry.isDirectory()) {
            return walk(fullPath);
          }
          return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")
            ? [readFileSync(fullPath, "utf8")]
            : [];
        }
      );
    }
    const appSource = walk("app").join("\n");
    expect(appSource).not.toContain("importCanonicalTemplateDraft");
    expect(appSource).not.toContain("canonical-template:import");
  });

  it("prints import help from the Node 24 CLI", async () => {
    const result = await execFileAsync(
      process.execPath,
      [
        "--experimental-transform-types",
        "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
        "--disable-warning=ExperimentalWarning",
        "scripts/import-canonical-template.mjs",
        "--help",
      ],
      { cwd: process.cwd() }
    );
    expect(result.stdout).toContain("Dry-run is the default");
    expect(result.stdout).toContain("create-revision");
    expect(result.stdout).toContain("update-draft");
    expect(result.stdout).toContain("--allow-production");
    expect(result.stdout).toContain("--confirm-draft-import");
    expect(result.stdout).toContain("creates drafts only");
    expect(result.stdout).not.toContain("--publish");
  }, 20000);
});
