import type { Prisma } from "@prisma/client";

/**
 * Advisory lock order inside one PostgreSQL transaction.
 *
 * 1. `clinic-account-structure:{clinicId}` — always first, before any other
 *    advisory lock and before the first structural write. Several accounts
 *    are sorted by clinic id and locked in that order.
 * 2. Narrower account locks, only when that mutation already takes them:
 *    `clinic-team-capacity` before `clinic-guide-capacity` when both are
 *    taken; `clinic-guide-capacity` before `clinic-site-location-capacity`
 *    when both are taken. `clinic-plan-downgrade` stays in its own short
 *    transaction and is acquired after the structure lock.
 * 3. User and token locks after the account locks: `clinic-invite-email`,
 *    `clinic-access`, then `account-token`.
 *
 * Preparation transactions keep `clinic-account-split` and do not take the
 * structure lock. Split execution takes structure locks first, then the
 * preparation lock. PostgreSQL transaction advisory locks are re-entrant,
 * so a helper may request the structure lock again inside a transaction
 * that already holds it.
 *
 * Do not hold these locks across Stripe, email, R2, or user input.
 */

/**
 * One account-scoped transaction lock for mutations of the structural and
 * commercial state a split execution has to observe: sites, locations,
 * guides, revisions, placements, memberships, invitations, entitlements,
 * billing projection, and primary-site branding references.
 *
 * The key is derived only from `clinicId`. Callers cannot pass an arbitrary
 * lock name. The lock is transaction-scoped (`pg_advisory_xact_lock`) and
 * re-entrant in the same transaction.
 */
export function clinicAccountStructureLockKey(clinicId: string): string {
  return `clinic-account-structure:${clinicId}`;
}

export async function lockClinicAccountStructure(
  tx: Prisma.TransactionClient,
  clinicId: string
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clinicAccountStructureLockKey(clinicId)}))`;
}

/**
 * Locks every distinct account in ascending clinic id order.
 * Opposite-direction callers therefore acquire the same sequence.
 * An empty list locks nothing.
 */
export async function lockClinicAccountStructures(
  tx: Prisma.TransactionClient,
  clinicIds: readonly string[]
): Promise<void> {
  const ordered = [...new Set(clinicIds)].sort();
  for (const clinicId of ordered) {
    await lockClinicAccountStructure(tx, clinicId);
  }
}

/**
 * One clinic-scoped transaction lock for operations that increase occupied
 * team places, and for acceptance/resend/cancel so a reservation cannot
 * disappear between the count and the write.
 */
export async function lockClinicTeamCapacity(
  tx: Prisma.TransactionClient,
  clinicId: string
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`clinic-team-capacity:${clinicId}`}))`;
}

/** One clinic-scoped lock for creating or adapting a counted custom guide. */
export async function lockClinicGuideCapacity(
  tx: Prisma.TransactionClient,
  clinicId: string
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`clinic-guide-capacity:${clinicId}`}))`;
}

/**
 * One clinic-scoped lock for allocating a Practice → Essential schedule
 * attempt id. Concurrent schedule requests share that id.
 */
export async function lockClinicPlanDowngrade(
  tx: Prisma.TransactionClient,
  clinicId: string
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`clinic-plan-downgrade:${clinicId}`}))`;
}

/**
 * One account-scoped lock for site and location capacity, and for slug
 * collisions between a root guide address and a location path.
 * Advisory locks are re-entrant inside the same transaction.
 */
export async function lockClinicSiteLocationCapacity(
  tx: Prisma.TransactionClient,
  clinicId: string
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`clinic-site-location-capacity:${clinicId}`}))`;
}
