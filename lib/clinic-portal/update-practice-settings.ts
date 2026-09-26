import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { lockClinicAccountStructure } from "@/lib/entitlements/locks";
import type { PracticeSettingsInput } from "@/lib/clinic-portal/practice-settings-schema";
import { syncPracticeSettings } from "@/lib/clinic-portal/sync-practice-chrome";
import { getPrisma } from "@/lib/prisma";

export async function updatePracticeSettings(input: {
  clinicId: string;
  values: PracticeSettingsInput;
}): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    await lockClinicAccountStructure(tx, input.clinicId);
    const clinic = await tx.clinic.findUnique({
      where: { id: input.clinicId },
      select: { id: true },
    });

    if (!clinic) {
      throw new ClinicPortalError("Practice not found.", "not_found");
    }

    await syncPracticeSettings(tx, input);
  });
}
