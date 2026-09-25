import type { Prisma } from "@prisma/client";

/**
 * Account-scoped lock for split preparation creation, destination shell
 * creation, and readiness transitions.
 *
 * Execution must take this same lock on the source Account before it moves
 * a Site, copies guides, or changes memberships. That execution lock is not
 * taken across ordinary clinic edits in this preparation release.
 */
export function accountSplitLockKey(clinicId: string): string {
  return `clinic-account-split:${clinicId}`;
}

export async function lockAccountSplit(
  tx: Prisma.TransactionClient,
  clinicId: string
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${accountSplitLockKey(clinicId)}))`;
}

/**
 * Serializes compatibility-slug allocation so two shells cannot reserve the
 * same Clinic.slug. Distinct from the per-account preparation lock.
 */
export async function lockAccountSplitShellSlug(
  tx: Prisma.TransactionClient
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('clinic-account-split-shell-slug'))`;
}
