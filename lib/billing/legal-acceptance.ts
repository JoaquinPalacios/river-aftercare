import "server-only";

import { LegalAcceptanceSource } from "@prisma/client";

import { logStripeBilling } from "@/lib/billing/log";
import {
  PRIVACY_ACKNOWLEDGEMENT_VERSION,
  TERMS_ACCEPTANCE_VERSION,
} from "@/lib/legal/status";
import { getPrisma } from "@/lib/prisma";

export type LegalAcceptanceDb = {
  legalAcceptance: {
    create(args: {
      data: LegalAcceptanceInsert & { createdAt: Date };
      select?: Record<string, boolean>;
    }): Promise<{
      id: string;
      termsVersion: string;
      privacyVersionAcknowledged: string;
      acceptedAt: Date;
      clinicId: string;
      userId: string;
    }>;
    findFirst(args: {
      where: {
        clinicId: string;
        userId: string;
        termsVersion: string;
        privacyVersionAcknowledged: string;
        source: LegalAcceptanceSource;
      };
      select?: { id: boolean };
    }): Promise<{ id: string } | null>;
  };
};

export type LegalAcceptanceInsert = {
  clinicId: string;
  userId: string;
  termsVersion: string;
  privacyVersionAcknowledged: string;
  source: LegalAcceptanceSource;
  acceptedAt: Date;
};

export async function insertLegalAcceptance(
  db: LegalAcceptanceDb,
  input: LegalAcceptanceInsert
): Promise<{
  id: string;
  termsVersion: string;
  privacyVersionAcknowledged: string;
  acceptedAt: Date;
  clinicId: string;
  userId: string;
}> {
  const row = await db.legalAcceptance.create({
    data: {
      clinicId: input.clinicId,
      userId: input.userId,
      termsVersion: input.termsVersion,
      privacyVersionAcknowledged: input.privacyVersionAcknowledged,
      source: input.source,
      acceptedAt: input.acceptedAt,
      createdAt: input.acceptedAt,
    },
    select: {
      id: true,
      termsVersion: true,
      privacyVersionAcknowledged: true,
      acceptedAt: true,
      clinicId: true,
      userId: true,
    },
  });

  logStripeBilling({
    event: "legal_acceptance_recorded",
    clinicId: row.clinicId,
    userId: row.userId,
    termsVersion: row.termsVersion,
    privacyVersionAcknowledged: row.privacyVersionAcknowledged,
    source: input.source,
  });

  return row;
}

export async function recordBillingLegalAcceptance(input: {
  clinicId: string;
  userId: string;
  acceptedAt?: Date;
  db?: LegalAcceptanceDb;
}): Promise<{
  id: string;
  termsVersion: string;
  privacyVersionAcknowledged: string;
  acceptedAt: Date;
  clinicId: string;
  userId: string;
}> {
  return insertLegalAcceptance(input.db ?? getPrisma(), {
    clinicId: input.clinicId,
    userId: input.userId,
    termsVersion: TERMS_ACCEPTANCE_VERSION,
    privacyVersionAcknowledged: PRIVACY_ACKNOWLEDGEMENT_VERSION,
    source: LegalAcceptanceSource.BILLING_CHECKOUT,
    acceptedAt: input.acceptedAt ?? new Date(),
  });
}

export async function hasCurrentBillingLegalAcceptance(input: {
  clinicId: string;
  userId: string;
  db?: LegalAcceptanceDb;
}): Promise<boolean> {
  const db = input.db ?? getPrisma();
  const row = await db.legalAcceptance.findFirst({
    where: {
      clinicId: input.clinicId,
      userId: input.userId,
      termsVersion: TERMS_ACCEPTANCE_VERSION,
      privacyVersionAcknowledged: PRIVACY_ACKNOWLEDGEMENT_VERSION,
      source: LegalAcceptanceSource.BILLING_CHECKOUT,
    },
    select: { id: true },
  });
  return Boolean(row);
}
