export const PRISMA_SCHEMA_PATH = "prisma/schema.prisma";
export const PRISMA_MIGRATIONS_DIR = "prisma/migrations";
export const DESTRUCTIVE_SQL_REVIEW_MARKER =
  "river-aftercare:destructive-reviewed";
export const DESTRUCTIVE_SQL_REVIEW_COMMENT = `-- ${DESTRUCTIVE_SQL_REVIEW_MARKER}`;

const IGNORED_MIGRATION_FILES = new Set([".gitkeep"]);

const DESTRUCTIVE_SQL_PATTERNS = [
  { kind: "DROP TABLE", pattern: /\bDROP\s+TABLE\b/i },
  { kind: "DROP COLUMN", pattern: /\bDROP\s+COLUMN\b/i },
  { kind: "DROP TYPE", pattern: /\bDROP\s+TYPE\b/i },
  { kind: "DROP SCHEMA", pattern: /\bDROP\s+SCHEMA\b/i },
  { kind: "TRUNCATE", pattern: /\bTRUNCATE\b/i },
  { kind: "DELETE FROM", pattern: /\bDELETE\s+FROM\b/i },
  { kind: "ALTER DROP", pattern: /\bALTER\s+TABLE\b[\s\S]{0,200}\bDROP\b/i },
];

/**
 * @param {string} filePath
 * @returns {string}
 */
export function normalizeRepoPath(filePath) {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

/**
 * @param {string} filePath
 * @returns {boolean}
 */
export function isPrismaSchemaPath(filePath) {
  return normalizeRepoPath(filePath) === PRISMA_SCHEMA_PATH;
}

/**
 * @param {string} filePath
 * @returns {boolean}
 */
export function isPrismaMigrationsPath(filePath) {
  const normalized = normalizeRepoPath(filePath);
  return (
    normalized === PRISMA_MIGRATIONS_DIR ||
    normalized.startsWith(`${PRISMA_MIGRATIONS_DIR}/`)
  );
}

/**
 * @param {string} filePath
 * @returns {string | null}
 */
export function migrationDirectoryName(filePath) {
  const normalized = normalizeRepoPath(filePath);
  const prefix = `${PRISMA_MIGRATIONS_DIR}/`;
  if (!normalized.startsWith(prefix)) {
    return null;
  }
  const rest = normalized.slice(prefix.length);
  const [directory, ...nested] = rest.split("/");
  if (!directory || IGNORED_MIGRATION_FILES.has(directory)) {
    return null;
  }
  if (directory === "migration_lock.toml" && nested.length === 0) {
    return null;
  }
  return directory;
}

/**
 * @param {string} output
 * @returns {{ path: string, status: "added" | "modified" | "deleted" | "renamed" }[]}
 */
export function parseGitNameStatus(output) {
  const changes = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) {
      continue;
    }
    const [code, first, second] = line.split("\t");
    const statusCode = code[0];
    if ((statusCode === "R" || statusCode === "C") && first && second) {
      changes.push({ path: first, status: "deleted" });
      changes.push({ path: second, status: "added" });
      continue;
    }
    if (!first) {
      continue;
    }
    if (statusCode === "A") {
      changes.push({ path: first, status: "added" });
    } else if (statusCode === "M") {
      changes.push({ path: first, status: "modified" });
    } else if (statusCode === "D") {
      changes.push({ path: first, status: "deleted" });
    } else if (statusCode === "T") {
      changes.push({ path: first, status: "modified" });
    }
  }
  return changes;
}

/**
 * @param {{ path: string, status: string }[][]} groups
 * @returns {{ path: string, status: "added" | "modified" | "deleted" | "renamed" }[]}
 */
export function mergeFileChanges(groups) {
  /** @type {Map<string, "added" | "modified" | "deleted" | "renamed">} */
  const byPath = new Map();
  for (const group of groups) {
    for (const change of group) {
      const path = normalizeRepoPath(change.path);
      const existing = byPath.get(path);
      if (!existing) {
        byPath.set(path, change.status);
        continue;
      }
      if (existing === "deleted" && change.status === "added") {
        byPath.set(path, "modified");
        continue;
      }
      if (existing === "added" && change.status === "deleted") {
        byPath.delete(path);
        continue;
      }
      byPath.set(path, change.status);
    }
  }
  return [...byPath.entries()].map(([path, status]) => ({ path, status }));
}

/**
 * @param {string} sql
 * @returns {{ kind: string, detail: string }[]}
 */
export function findDestructiveSql(sql) {
  /** @type {{ kind: string, detail: string }[]} */
  const hits = [];
  for (const { kind, pattern } of DESTRUCTIVE_SQL_PATTERNS) {
    if (pattern.test(sql)) {
      hits.push({ kind, detail: kind });
    }
  }
  return hits;
}

/**
 * @param {string} sql
 * @returns {boolean}
 */
export function hasDestructiveSqlReviewMarker(sql) {
  return sql.includes(DESTRUCTIVE_SQL_REVIEW_MARKER);
}

/**
 * @param {{
 *   changes: { path: string, status: "added" | "modified" | "deleted" | "renamed" }[],
 *   readFile?: (filePath: string) => string | null,
 * }} input
 */
export function evaluatePrismaReleaseChange(input) {
  const changes = input.changes.map((change) => ({
    ...change,
    path: normalizeRepoPath(change.path),
  }));
  const readFile = input.readFile ?? (() => null);

  const schemaChanges = changes.filter((change) =>
    isPrismaSchemaPath(change.path)
  );
  const migrationChanges = changes.filter(
    (change) =>
      isPrismaMigrationsPath(change.path) &&
      !change.path.endsWith("/.gitkeep") &&
      change.path !== `${PRISMA_MIGRATIONS_DIR}/.gitkeep`
  );

  const schemaChanged = schemaChanges.length > 0;
  const migrationsChanged = migrationChanges.length > 0;
  const prismaChanged = schemaChanged || migrationsChanged;

  if (!prismaChanged) {
    return emptyEvaluation(changes.length > 0 ? "app-only" : "none");
  }

  /** @type {{ level: "error" | "warning", code: string, message: string }[]} */
  const findings = [];
  const addedMigrationDirectories = [
    ...new Set(
      migrationChanges
        .filter(
          (change) =>
            change.status === "added" && change.path.endsWith("/migration.sql")
        )
        .map((change) => migrationDirectoryName(change.path))
        .filter(Boolean)
    ),
  ];

  const addedDirectorySet = new Set(addedMigrationDirectories);

  if (schemaChanged && addedMigrationDirectories.length === 0) {
    findings.push({
      level: "error",
      code: "schema-without-migration",
      message:
        "prisma/schema.prisma changed but this release does not add a new prisma/migrations/<name>/migration.sql file.",
    });
  }

  for (const change of migrationChanges) {
    if (change.path === `${PRISMA_MIGRATIONS_DIR}/migration_lock.toml`) {
      findings.push({
        level: "error",
        code: "migration-lock-changed",
        message:
          "prisma/migrations/migration_lock.toml changed. Provider/lock changes need explicit review and are not a normal schema release.",
      });
      continue;
    }

    const directory = migrationDirectoryName(change.path);
    if (!directory) {
      findings.push({
        level: "error",
        code: "unexpected-migration-path",
        message: `Unexpected Prisma migration path: ${change.path}`,
      });
      continue;
    }

    const belongsToNewDirectory = addedDirectorySet.has(directory);
    if (!belongsToNewDirectory) {
      findings.push({
        level: "error",
        code: "existing-migration-rewritten",
        message: `Existing migration path changed (${change.status}): ${change.path}. Do not rewrite already-shipped migrations; add a new migration instead.`,
      });
    }
  }

  for (const directory of addedMigrationDirectories) {
    const sqlPath = `${PRISMA_MIGRATIONS_DIR}/${directory}/migration.sql`;
    const sql = readFile(sqlPath);
    if (sql == null || sql.trim() === "") {
      findings.push({
        level: "error",
        code: "missing-migration-sql",
        message: `New migration ${directory} is missing migration.sql (or the file is empty).`,
      });
      continue;
    }

    const destructive = findDestructiveSql(sql);
    if (destructive.length === 0) {
      continue;
    }
    const kinds = [...new Set(destructive.map((hit) => hit.kind))].join(", ");
    if (!hasDestructiveSqlReviewMarker(sql)) {
      findings.push({
        level: "error",
        code: "destructive-sql-unreviewed",
        message: `Migration ${directory} contains destructive SQL (${kinds}) without ${DESTRUCTIVE_SQL_REVIEW_COMMENT}. That marker is a human review attestation, not an automatic safety approval.`,
      });
      continue;
    }
    findings.push({
      level: "warning",
      code: "destructive-sql-reviewed",
      message: `Migration ${directory} contains destructive SQL (${kinds}). The review marker is present, but expand/contract sequencing and old-version compatibility still require a human release decision.`,
    });
  }

  const kind = schemaChanged
    ? migrationsChanged
      ? "schema-and-migrations"
      : "schema-only"
    : "migrations-only";

  const errors = findings.filter((finding) => finding.level === "error");
  const warnings = findings.filter((finding) => finding.level === "warning");

  return {
    kind,
    prismaChanged: true,
    schemaChanged,
    migrationsChanged,
    addedMigrationDirectories,
    releaseWarning: true,
    findings,
    errors,
    warnings,
  };
}

/**
 * @param {PrismaReleaseKind} kind
 */
function emptyEvaluation(kind) {
  return {
    kind,
    prismaChanged: false,
    schemaChanged: false,
    migrationsChanged: false,
    addedMigrationDirectories: [],
    releaseWarning: false,
    findings: [],
    errors: [],
    warnings: [],
  };
}

/**
 * @param {ReturnType<typeof evaluatePrismaReleaseChange>} evaluation
 * @returns {string}
 */
export function formatPrismaReleaseReport(evaluation) {
  if (!evaluation.prismaChanged) {
    return "No Prisma schema/migration changes.";
  }

  const lines = [
    "========== PRISMA RELEASE GATE ==========",
    "Production schema change detected.",
    "River Aftercare keeps automatic Vercel Production deployments from main enabled.",
    "After merge, the Production schema gate is expected to block the new build while migrations are pending.",
    "Vercel does not apply migrations.",
    "",
    "Required production sequence:",
    "  1. Review migration SQL (additive / expand / contract / data).",
    "  2. pnpm prod:db:status",
    "  3. pnpm prod:db:migrate --apply",
    "  4. pnpm prod:db:verify",
    "  5. Redeploy the same merged SHA so the schema gate can pass.",
    "",
    `Kind: ${evaluation.kind}`,
  ];

  if (evaluation.addedMigrationDirectories.length > 0) {
    lines.push(
      `New migrations: ${evaluation.addedMigrationDirectories.join(", ")}`
    );
  }

  for (const finding of evaluation.findings) {
    lines.push(
      `${finding.level.toUpperCase()} [${finding.code}]: ${finding.message}`
    );
  }

  if (evaluation.errors.length === 0) {
    lines.push(
      "Pairing check passed. This is still a schema-touching release — review and apply the production migration using the trusted prod:db:* workflow, verify it, then redeploy the same merged SHA."
    );
  }

  lines.push("=========================================");
  return lines.join("\n");
}

/**
 * @param {ReturnType<typeof evaluatePrismaReleaseChange>} evaluation
 * @returns {number}
 */
export function prismaReleaseExitCode(evaluation) {
  return evaluation.errors.length > 0 ? 1 : 0;
}
