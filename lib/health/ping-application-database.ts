import "server-only";

import { getPrisma } from "@/lib/prisma";

/**
 * Smallest pooled-runtime readiness probe. Uses the canonical Prisma client
 * (pooled DATABASE_URL) and does not inspect application tables or the
 * unpooled migrate connection.
 */
export async function pingApplicationDatabase(): Promise<void> {
  await getPrisma().$queryRaw`SELECT 1`;
}
