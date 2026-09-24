import type { Prisma } from "@prisma/client";

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
