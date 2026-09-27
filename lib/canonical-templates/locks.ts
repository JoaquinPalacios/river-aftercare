import type { Prisma } from "@prisma/client";

/**
 * Transaction-scoped lock for one canonical template.
 *
 * The key is derived only from the template id. Callers cannot pass an
 * arbitrary lock name. PostgreSQL advisory locks are re-entrant in the same
 * transaction. This family is separate from clinic account locks.
 */
export function canonicalTemplateLockKey(templateId: string): string {
  return `canonical-template:${templateId}`;
}

export async function lockCanonicalTemplate(
  tx: Prisma.TransactionClient,
  templateId: string
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${canonicalTemplateLockKey(templateId)}))`;
}
