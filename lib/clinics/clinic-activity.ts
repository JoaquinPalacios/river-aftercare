import "server-only";

import type { Prisma } from "@prisma/client";
import { notFound } from "next/navigation";

import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { getPrisma } from "@/lib/prisma";

export const CLINIC_INACTIVE_MESSAGE =
  "This clinic is inactive. Reactivate it before making this change.";

type ClinicActivityReader = {
  clinic: {
    findUnique: (args: {
      where: { id: string };
      select: { deactivatedAt: true };
    }) => Promise<{ deactivatedAt: Date | null } | null>;
  };
};

export function clinicIsInactive(
  deactivatedAt: Date | null | undefined
): boolean {
  return deactivatedAt != null;
}

export async function inactiveClinicMessage(
  db: ClinicActivityReader,
  clinicId: string
): Promise<string | null> {
  const clinic = await db.clinic.findUnique({
    where: { id: clinicId },
    select: { deactivatedAt: true },
  });
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
  const message = await inactiveClinicMessage(getPrisma(), clinicId);
  if (message) {
    notFound();
  }
}
