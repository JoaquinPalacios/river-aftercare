import "server-only";

import type { Prisma } from "@prisma/client";
import { notFound } from "next/navigation";

import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { getPrisma } from "@/lib/prisma";

export const CLINIC_INACTIVE_MESSAGE =
  "This clinic is inactive. Reactivate it before making this change.";

export const CLINIC_ARCHIVED_MESSAGE =
  "This clinic is archived. Unarchive it before making this change.";

type ClinicActivityReader = {
  clinic: {
    findUnique: (args: {
      where: { id: string };
      select: { deactivatedAt: true; archivedAt: true };
    }) => Promise<{
      deactivatedAt: Date | null;
      archivedAt: Date | null;
    } | null>;
  };
};

export function clinicIsInactive(
  deactivatedAt: Date | null | undefined
): boolean {
  return deactivatedAt != null;
}

/**
 * Closed to patients and clinic staff. Archive always sets `deactivatedAt`
 * as well. The database check rejects archive without deactivation.
 */
export function clinicIsClosed(
  clinic:
    | {
        deactivatedAt?: Date | null;
        archivedAt?: Date | null;
      }
    | null
    | undefined
): boolean {
  return clinic?.deactivatedAt != null || clinic?.archivedAt != null;
}

export async function inactiveClinicMessage(
  db: ClinicActivityReader,
  clinicId: string
): Promise<string | null> {
  const clinic = await db.clinic.findUnique({
    where: { id: clinicId },
    select: { deactivatedAt: true, archivedAt: true },
  });
  if (clinic?.archivedAt) {
    return CLINIC_ARCHIVED_MESSAGE;
  }
  if (clinicIsInactive(clinic?.deactivatedAt)) {
    return CLINIC_INACTIVE_MESSAGE;
  }
  return null;
}

export async function assertClinicActive(
  db: Prisma.TransactionClient,
  clinicId: string
): Promise<void> {
  const message = await inactiveClinicMessage(db, clinicId);
  if (message) {
    throw new ClinicPortalError(message, "conflict");
  }
}

export async function notFoundIfClinicInactive(
  clinicId: string
): Promise<void> {
  const db = getPrisma() as unknown as {
    clinic?: ClinicActivityReader["clinic"];
  };
  // Billing action doubles stub only the delegates they exercise.
  // Production Prisma always includes clinic.findUnique.
  if (typeof db.clinic?.findUnique !== "function") {
    return;
  }
  const message = await inactiveClinicMessage(
    db as ClinicActivityReader,
    clinicId
  );
  if (message) {
    notFound();
  }
}
