export const PRISMA_SCHEMA_PATH: string;
export const PRISMA_MIGRATIONS_DIR: string;
export const DESTRUCTIVE_SQL_REVIEW_MARKER: string;
export const DESTRUCTIVE_SQL_REVIEW_COMMENT: string;

export type FileChangeStatus = "added" | "modified" | "deleted" | "renamed";

export type FileChange = {
  path: string;
  status: FileChangeStatus;
};

export type DestructiveSqlHit = {
  kind: string;
  detail: string;
};

export type PrismaReleaseKind =
  | "none"
  | "app-only"
  | "schema-and-migrations"
  | "schema-only"
  | "migrations-only";

export type PrismaReleaseFinding = {
  level: "error" | "warning";
  code: string;
  message: string;
};

export type PrismaReleaseEvaluation = {
  kind: PrismaReleaseKind;
  prismaChanged: boolean;
  schemaChanged: boolean;
  migrationsChanged: boolean;
  addedMigrationDirectories: string[];
  releaseWarning: boolean;
  findings: PrismaReleaseFinding[];
  errors: PrismaReleaseFinding[];
  warnings: PrismaReleaseFinding[];
};

export function normalizeRepoPath(filePath: string): string;

export function isPrismaSchemaPath(filePath: string): boolean;

export function isPrismaMigrationsPath(filePath: string): boolean;

export function migrationDirectoryName(filePath: string): string | null;

export function parseGitNameStatus(output: string): FileChange[];

export function mergeFileChanges(groups: FileChange[][]): FileChange[];

export function findDestructiveSql(sql: string): DestructiveSqlHit[];

export function hasDestructiveSqlReviewMarker(sql: string): boolean;

export function evaluatePrismaReleaseChange(input: {
  changes: FileChange[];
  readFile?: (filePath: string) => string | null;
}): PrismaReleaseEvaluation;

export function formatPrismaReleaseReport(
  evaluation: PrismaReleaseEvaluation
): string;

export function prismaReleaseExitCode(
  evaluation: PrismaReleaseEvaluation
): number;
