/**
 * Prisma CLI (migrate, seed, studio) connection string.
 *
 * Local Docker uses a single direct DATABASE_URL.
 * Production Neon sets DATABASE_URL to the pooled endpoint and DIRECT_URL to
 * the unpooled endpoint. Production helpers must load .env.neon-production
 * after unsetting ambient DATABASE_URL / DIRECT_URL so local .env cannot win.
 * Do not require DIRECT_URL locally.
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
