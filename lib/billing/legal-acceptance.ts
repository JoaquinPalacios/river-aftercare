import "server-only";

import { LegalAcceptanceSource, type PrismaClient } from "@prisma/client";

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

/**
 * Current Terms and Privacy acceptance for this user and clinic.
 * Registration and billing checkout are both explicit acceptances of the
 * same document versions. Either one satisfies the document check.
 * This does not record a new row and does not treat registration as
 * payment consent. Account-split destination readiness still requires
 * source BILLING_CHECKOUT on the destination clinic.
 */
export function currentDocumentAcceptanceWhere(
  clinicId: string,
  userId: string
) {
  return {
    clinicId,
    userId,
    termsVersion: TERMS_ACCEPTANCE_VERSION,
    privacyVersionAcknowledged: PRIVACY_ACKNOWLEDGEMENT_VERSION,
    source: {
      in: [
        LegalAcceptanceSource.BILLING_CHECKOUT,
        LegalAcceptanceSource.REGISTRATION,
      ],
    },
  };
}

export async function findCurrentDocumentAcceptance(input: {
  clinicId: string;
  userId: string;
  db?: Pick<PrismaClient, "legalAcceptance">;
}): Promise<{ id: string; source: LegalAcceptanceSource } | null> {
  const db = input.db ?? getPrisma();
  return db.legalAcceptance.findFirst({
    where: currentDocumentAcceptanceWhere(input.clinicId, input.userId),
    select: { id: true, source: true },
  });
}
