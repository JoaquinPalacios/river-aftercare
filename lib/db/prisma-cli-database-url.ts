/**
 * Prisma CLI (migrate, seed, studio) connection string.
 *
 * Local Docker uses a single direct DATABASE_URL.
 * Later Neon production should set DATABASE_URL to the pooled endpoint and
 * DIRECT_URL to the unpooled endpoint. Do not require DIRECT_URL locally.
 */
export function prismaCliDatabaseUrl(
  env: NodeJS.Dict<string | undefined> = process.env
): string | undefined {
  const direct = env.DIRECT_URL?.trim();
  if (direct) {
    return direct;
  }
  return env.DATABASE_URL;
}
