export const PRODUCTION_ENV_FILE_NAME: string;
export const PRODUCTION_MIGRATE_INTENT_ENV: string;

export type ProductionMigrateAction = "status" | "deploy" | "verify";

export type ProductionMigrateEnvEvaluation =
  | {
      ok: true;
      errors: string[];
      warnings: string[];
      hasDatabaseUrl: boolean;
      hasDirectUrl: boolean;
    }
  | {
      ok: false;
      errors: string[];
      warnings: string[];
      hasDatabaseUrl: boolean;
      hasDirectUrl: boolean;
    };

export function parseEnvFileContents(contents: string): Record<string, string>;

export function productionEnvFileNameIsAllowed(filePath: string): boolean;

export function connectionHostIsLoopback(connectionString: string): boolean;

export function redactSecrets(text: string): string;

export function readPrismaProviderFromLockfile(
  lockfileContents: string
): string | null;

export function evaluateProductionMigrateEnv(input: {
  envFilePath: string;
  envFileExists: boolean;
  parsed: Record<string, string>;
  prismaProvider?: string | null;
}): ProductionMigrateEnvEvaluation;

export function productionPrismaArgs(action: ProductionMigrateAction): string[];

export function assertProductionPrismaArgs(args: readonly string[]): void;

export function isForbiddenProductionPrismaInvocation(
  args: readonly string[]
): boolean;
