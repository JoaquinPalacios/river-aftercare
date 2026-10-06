import "server-only";

import { redirect } from "next/navigation";

import { getPrisma } from "@/lib/prisma";

/** Operational clinic pages send a tombstoned clinic back to its history view. */
export async function redirectIfClinicPermanentlyDeleted(
  clinicId: string
): Promise<void> {
  const clinic = await getPrisma().clinic.findUnique({
    where: { id: clinicId },
    select: { permanentlyDeletedAt: true },
  });
  if (clinic?.permanentlyDeletedAt) {
    redirect(`/operator/clinics/${clinicId}`);
  }
}
