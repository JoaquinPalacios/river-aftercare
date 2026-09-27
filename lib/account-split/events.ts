import type {
  ClinicAccountSplitEventKind,
  ClinicAccountSplitStatus,
  Prisma,
} from "@prisma/client";

import { getPrisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | ReturnType<typeof getPrisma>;

export type AccountSplitEventInput = {
  preparationId: string;
  kind: ClinicAccountSplitEventKind;
  fromStatus?: ClinicAccountSplitStatus | null;
  toStatus?: ClinicAccountSplitStatus | null;
  actorUserId?: string | null;
  sourceClinicId: string;
  destinationClinicId?: string | null;
  siteId?: string | null;
  locationId?: string | null;
  category?: string | null;
};

export async function recordAccountSplitEvent(
  db: Db,
  input: AccountSplitEventInput
): Promise<void> {
  await db.clinicAccountSplitEvent.create({
    data: {
      preparationId: input.preparationId,
      kind: input.kind,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      actorUserId: input.actorUserId ?? null,
      sourceClinicId: input.sourceClinicId,
      destinationClinicId: input.destinationClinicId ?? null,
      siteId: input.siteId ?? null,
      locationId: input.locationId ?? null,
      category: input.category ?? null,
    },
  });
}
