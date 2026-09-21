import "server-only";

import type { PrismaClient } from "@prisma/client";

import {
  billingIdentitySchema,
  normalizeBillingIdentity,
  type NormalizedBillingIdentity,
} from "@/lib/billing/billing-identity";
import { fieldErrorsFromZod } from "@/lib/clinic-portal/field-errors";
import { recordBillingLegalAcceptance } from "@/lib/billing/legal-acceptance";
import { getPrisma } from "@/lib/prisma";

type SetupDb = Pick<
  PrismaClient,
  "clinicBillingProfile" | "legalAcceptance" | "$transaction"
>;

export async function saveBillingSetup(
  input: {
    clinicId: string;
    userId: string;
    form: unknown;
    acceptedAt?: Date;
  },
  db: SetupDb = getPrisma()
): Promise<
  | { ok: true; identity: NormalizedBillingIdentity }
  | { ok: false; error: string; fieldErrors: Record<string, string> }
> {
  const parsed = billingIdentitySchema.safeParse(input.form);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the billing details.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const identity = normalizeBillingIdentity(parsed.data);
  const acceptedAt = input.acceptedAt ?? new Date();

  await db.$transaction(async (tx) => {
    await tx.clinicBillingProfile.upsert({
      where: { clinicId: input.clinicId },
      create: {
        clinicId: input.clinicId,
        ...identity,
      },
      update: identity,
    });
    await recordBillingLegalAcceptance({
      clinicId: input.clinicId,
      userId: input.userId,
      acceptedAt,
      db: tx,
    });
  });

  return { ok: true, identity };
}
