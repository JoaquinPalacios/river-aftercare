import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  assertAuditClient,
  formatBrandingAuditReport,
  listCrossOwnedCompletedSplits,
} from "@/lib/account-split/branding-ownership-audit.mjs";
import {
  PRODUCTION_AUDIT_TARGET,
  AUDIT_SKIP_DOTENV_ENV,
  AUDIT_TARGET_ENV,
  buildProductionBrandingAuditPlan,
} from "@/lib/release/production-branding-audit.mjs";
import { PRODUCTION_ENV_FILE_NAME } from "@/lib/release/production-migrate.mjs";

const NEON_POOLED =
  "postgresql://app:super-secret-password@ep-example-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require";
const NEON_DIRECT =
  "postgresql://app:super-secret-password@ep-example.ap-southeast-2.aws.neon.tech/neondb?sslmode=require";
const LOCAL =
  "postgresql://postgres:postgres@localhost:5432/care_guide?schema=public";

type Preparation = {
  id: string;
  status: string;
  sourceClinicId: string;
  destinationClinicId: string | null;
};

type Decision = {
  preparationId: string;
  decision: string;
  clinicSiteId: string;
};

type Site = {
  id: string;
  clinicId: string;
  logoUrl: string | null;
  darkLogoUrl: string | null;
  faviconUrl: string | null;
};

function auditDb(state: {
  preparations: Preparation[];
  decisions: Decision[];
  sites: Site[];
}) {
  const calls: string[] = [];
  const rejectWrite = (name: string) => async () => {
    calls.push(name);
    throw new Error(`unexpected write ${name}`);
  };
  return {
    calls,
    clinicAccountSplitPreparation: {
      findMany: async (args: { where?: { status?: string } }) => {
        calls.push("clinicAccountSplitPreparation.findMany");
        if (args.where?.status !== "COMPLETED") {
          throw new Error("audit must query COMPLETED preparations");
        }
        return state.preparations.filter(
          (row) => row.status === "COMPLETED" && row.destinationClinicId
        );
      },
      update: rejectWrite("preparation.update"),
      delete: rejectWrite("preparation.delete"),
      create: rejectWrite("preparation.create"),
    },
    clinicAccountSplitSiteDecision: {
      findMany: async (args: {
        where?: { decision?: string; preparationId?: { in?: string[] } };
      }) => {
        calls.push("clinicAccountSplitSiteDecision.findMany");
        if (args.where?.decision !== "SPLIT") {
          throw new Error("audit must query SPLIT decisions");
        }
        const ids = new Set(args.where.preparationId?.in ?? []);
        return state.decisions.filter(
          (row) => row.decision === "SPLIT" && ids.has(row.preparationId)
        );
      },
      update: rejectWrite("decision.update"),
      delete: rejectWrite("decision.delete"),
      create: rejectWrite("decision.create"),
    },
    clinicSite: {
      findMany: async (args: { where?: { id?: { in?: string[] } } }) => {
        calls.push("clinicSite.findMany");
        const ids = new Set(args.where?.id?.in ?? []);
        return state.sites.filter((row) => ids.has(row.id));
      },
      update: rejectWrite("site.update"),
      delete: rejectWrite("site.delete"),
      create: rejectWrite("site.create"),
    },
  };
}

function completedSplit(overrides?: {
  preparationId?: string;
  logoUrl?: string | null;
  darkLogoUrl?: string | null;
  faviconUrl?: string | null;
  status?: string;
  siteClinicId?: string;
}) {
  const preparationId = overrides?.preparationId ?? "prep-1";
  const sourceClinicId = "clinic-source";
  const destinationClinicId = "clinic-destination";
  const siteId = "site-moved";
  return {
    preparations: [
      {
        id: preparationId,
        status: overrides?.status ?? "COMPLETED",
        sourceClinicId,
        destinationClinicId,
      },
    ],
    decisions: [
      {
        preparationId,
        decision: "SPLIT",
        clinicSiteId: siteId,
      },
    ],
    sites: [
      {
        id: siteId,
        clinicId: overrides?.siteClinicId ?? destinationClinicId,
        logoUrl: overrides?.logoUrl ?? null,
        darkLogoUrl: overrides?.darkLogoUrl ?? null,
        faviconUrl: overrides?.faviconUrl ?? null,
      },
    ],
  };
}

describe("completed split branding audit query", () => {
  it("reports zero affected destination-owned, null, and static values", async () => {
    const db = auditDb(
      completedSplit({
        logoUrl: "clinics/clinic-destination/branding/logo.png",
        darkLogoUrl: null,
        faviconUrl: "/brand/icon.png",
      })
    );
    await expect(listCrossOwnedCompletedSplits(db)).resolves.toEqual([]);
    expect(db.calls).toEqual([
      "clinicAccountSplitPreparation.findMany",
      "clinicAccountSplitSiteDecision.findMany",
      "clinicSite.findMany",
    ]);
  });

  it("reports a source-owned logo, dark logo, and favicon", async () => {
    const logo = auditDb(
      completedSplit({
        logoUrl: "clinics/clinic-source/branding/logo.png",
      })
    );
    await expect(listCrossOwnedCompletedSplits(logo)).resolves.toEqual([
      expect.objectContaining({ fields: ["logoUrl"] }),
    ]);

    const dark = auditDb(
      completedSplit({
        darkLogoUrl: "clinics/clinic-source/branding/dark.png",
      })
    );
    await expect(listCrossOwnedCompletedSplits(dark)).resolves.toEqual([
      expect.objectContaining({ fields: ["darkLogoUrl"] }),
    ]);

    const favicon = auditDb(
      completedSplit({
        faviconUrl: "/clinic-branding/clinic-source/favicon.png",
      })
    );
    await expect(listCrossOwnedCompletedSplits(favicon)).resolves.toEqual([
      expect.objectContaining({
        preparationId: "prep-1",
        sourceClinicId: "clinic-source",
        destinationClinicId: "clinic-destination",
        siteId: "site-moved",
        fields: ["faviconUrl"],
      }),
    ]);
  });

  it("ignores drafts and does not write", async () => {
    const db = auditDb(
      completedSplit({
        status: "DRAFT",
        logoUrl: "clinics/clinic-source/branding/logo.png",
      })
    );
    await expect(listCrossOwnedCompletedSplits(db)).resolves.toEqual([]);
    expect(db.calls).toEqual(["clinicAccountSplitPreparation.findMany"]);
    expect(db.calls.join(" ")).not.toMatch(/update|delete|create/);
  });

  it("fails when the Prisma delegate is missing instead of reporting clean", async () => {
    await expect(listCrossOwnedCompletedSplits({})).rejects.toThrow(
      /clinicAccountSplitPreparation\.findMany is unavailable/
    );
    await expect(
      listCrossOwnedCompletedSplits({
        clinicAccountSplitPreparation: {},
      })
    ).rejects.toThrow(/findMany is unavailable/);
    expect(() => assertAuditClient(undefined)).toThrow(/not initialized/);
  });

  it("propagates a query failure", async () => {
    const db = auditDb(completedSplit());
    db.clinicAccountSplitPreparation.findMany = async () => {
      throw new Error("connection refused");
    };
    await expect(listCrossOwnedCompletedSplits(db)).rejects.toThrow(
      /connection refused/
    );
  });
});

describe("branding audit report", () => {
  it("prints a zero count only as a successful summary", () => {
    const report = formatBrandingAuditReport(
      [],
      "configured DATABASE_URL (local development). Not the production audit."
    );
    expect(report).toContain("Affected completed splits: 0");
    expect(report).toContain("local development");
    expect(report).not.toContain("postgresql://");
  });

  it("prints safe identifiers for affected rows", () => {
    const report = formatBrandingAuditReport(
      [
        {
          preparationId: "prep-b",
          sourceClinicId: "src",
          destinationClinicId: "dst",
          siteId: "site",
          fields: ["logoUrl", "faviconUrl"],
        },
      ],
      "production database from .env.neon-production via unpooled DIRECT_URL"
    );
    expect(report).toContain("Affected completed splits: 1");
    expect(report).toContain(
      "preparationId=prep-b sourceClinicId=src destinationClinicId=dst siteId=site fields=logoUrl,faviconUrl"
    );
    expect(report).not.toContain("postgresql://");
  });
});

describe("branding audit CLI", () => {
  it("exits non-zero without a clean count when DATABASE_URL is missing", () => {
    const result = spawnSync(
      process.execPath,
      [
        join(
          process.cwd(),
          "scripts/audit-account-split-branding-ownership.mjs"
        ),
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          [AUDIT_SKIP_DOTENV_ENV]: "1",
          DATABASE_URL: "",
          DIRECT_URL: "",
        },
      }
    );
    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).not.toBe(0);
    expect(output).toMatch(/DATABASE_URL is required/);
    expect(output).toMatch(/Affected count was not established/);
    expect(output).not.toContain("Affected completed splits: 0");
  });

  it("exits non-zero when the database query fails and redacts the URL", () => {
    const result = spawnSync(
      process.execPath,
      [
        join(
          process.cwd(),
          "scripts/audit-account-split-branding-ownership.mjs"
        ),
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          [AUDIT_SKIP_DOTENV_ENV]: "1",
          DATABASE_URL:
            "postgresql://audit:super-secret-password@127.0.0.1:1/care_guide?connect_timeout=1",
        },
      }
    );
    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).not.toBe(0);
    expect(output).toMatch(/Affected count was not established/);
    expect(output).not.toContain("Affected completed splits: 0");
    expect(output).not.toContain("super-secret-password");
    expect(output).not.toContain("postgresql://");
  });

  it("documents the local and production commands", () => {
    const result = spawnSync(
      process.execPath,
      [
        join(
          process.cwd(),
          "scripts/audit-account-split-branding-ownership.mjs"
        ),
        "--help",
      ],
      { encoding: "utf8", env: process.env }
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("pnpm audit:account-split-branding");
    expect(result.stdout).toContain("pnpm prod:audit:account-split-branding");
    expect(result.stdout).toContain("configured DATABASE_URL");
  });
});

describe("production branding audit command", () => {
  it("loads the production env file and queries DIRECT_URL without keeping ambient URLs", () => {
    const plan = buildProductionBrandingAuditPlan({
      envFilePath: PRODUCTION_ENV_FILE_NAME,
      envFileExists: true,
      parsed: {
        DATABASE_URL: NEON_POOLED,
        DIRECT_URL: NEON_DIRECT,
      },
      prismaProvider: "postgresql",
      ambientEnv: {
        DATABASE_URL: LOCAL,
        DIRECT_URL: LOCAL,
        DOTENV_CONFIG_PATH: ".env",
        PATH: "/usr/bin",
      },
    });
    expect(plan.ok).toBe(true);
    expect(plan.childEnv?.DATABASE_URL).toBe(NEON_DIRECT);
    expect(plan.childEnv?.DIRECT_URL).toBe(NEON_DIRECT);
    expect(plan.childEnv?.[AUDIT_SKIP_DOTENV_ENV]).toBe("1");
    expect(plan.childEnv?.[AUDIT_TARGET_ENV]).toBe(PRODUCTION_AUDIT_TARGET);
    expect(plan.childEnv?.DOTENV_CONFIG_PATH).toBeUndefined();
    expect(plan.generateEnv?.DATABASE_URL).toBeUndefined();
    expect(plan.generateEnv?.DIRECT_URL).toBeUndefined();
    expect(plan.banner).toContain("production database");
    expect(plan.banner).not.toContain("super-secret-password");
    expect(plan.banner).not.toContain("postgresql://");
  });

  it("rejects a missing production env file before any query", () => {
    const cwd = mkdtempSync(join(tmpdir(), "prod-audit-missing-"));
    writeFileSync(join(cwd, ".env"), `DATABASE_URL="${LOCAL}"\n`);
    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), "scripts/prod-audit-account-split-branding.mjs")],
      {
        cwd,
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: LOCAL,
          DIRECT_URL: NEON_DIRECT,
        },
      }
    );
    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).toBe(1);
    expect(output).toMatch(/not present/);
    expect(output).toMatch(/Affected count was not established/);
    expect(output).not.toContain("Affected completed splits: 0");
    expect(output).not.toContain("super-secret-password");
    expect(output).not.toContain("postgresql://");
    expect(output).not.toContain("Generated Prisma Client");
  });

  it("rejects loopback production URLs", () => {
    const plan = buildProductionBrandingAuditPlan({
      envFilePath: PRODUCTION_ENV_FILE_NAME,
      envFileExists: true,
      parsed: {
        DATABASE_URL: LOCAL,
        DIRECT_URL: LOCAL,
      },
      prismaProvider: "postgresql",
      ambientEnv: {},
    });
    expect(plan.ok).toBe(false);
    expect(plan.childEnv).toBeNull();
    expect(plan.errors.join("\n")).toMatch(/loopback/);
    expect(plan.errors.join("\n")).not.toContain("postgresql://");
  });

  it("source stays query-only", () => {
    const prod = readFileSync(
      "scripts/prod-audit-account-split-branding.mjs",
      "utf8"
    );
    const audit = readFileSync(
      "scripts/audit-account-split-branding-ownership.mjs",
      "utf8"
    );
    const library = readFileSync(
      "lib/account-split/branding-ownership-audit.mjs",
      "utf8"
    );
    for (const source of [prod, audit, library]) {
      expect(source).not.toMatch(
        /\$executeRaw|stripe|migrate deploy|\.update\(|\.delete\(|\.create\(/
      );
    }
    expect(prod).toContain('["exec", "prisma", "generate"');
    expect(prod).not.toMatch(/prisma migrate|migrate deploy|migrate status/);
    expect(library).toContain("clinicAccountSplitPreparation.findMany");
    expect(library).toContain('status: "COMPLETED"');
  });
});
