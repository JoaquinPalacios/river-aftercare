import { LegalAcceptanceSource } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  insertLegalAcceptance,
  type LegalAcceptanceDb,
} from "@/lib/billing/legal-acceptance";
import {
  PRIVACY_ACKNOWLEDGEMENT_VERSION,
  TERMS_ACCEPTANCE_VERSION,
} from "@/lib/legal/status";

describe("legal acceptance records", () => {
  it("stores the current terms and privacy versions for the accepting user and clinic", async () => {
    const acceptedAt = new Date("2026-09-21T01:02:03.000Z");
    const created = await insertLegalAcceptance(
      memoryDb() as unknown as LegalAcceptanceDb,
      {
        clinicId: "clinic_1",
        userId: "user_1",
        termsVersion: TERMS_ACCEPTANCE_VERSION,
        privacyVersionAcknowledged: PRIVACY_ACKNOWLEDGEMENT_VERSION,
        source: LegalAcceptanceSource.BILLING_CHECKOUT,
        acceptedAt,
      }
    );

    expect(created).toMatchObject({
      clinicId: "clinic_1",
      userId: "user_1",
      termsVersion: "2026-09-21",
      privacyVersionAcknowledged: "2026-09-21",
      acceptedAt,
    });
    expect(TERMS_ACCEPTANCE_VERSION).toBe("2026-09-21");
    expect(PRIVACY_ACKNOWLEDGEMENT_VERSION).toBe("2026-09-21");
  });

  it("appends a later version without rewriting the earlier acceptance", async () => {
    const db = memoryDb();
    const firstAt = new Date("2026-09-21T00:00:00.000Z");
    const secondAt = new Date("2026-10-01T00:00:00.000Z");
    const writer = db as unknown as LegalAcceptanceDb;

    await insertLegalAcceptance(writer, {
      clinicId: "clinic_1",
      userId: "user_1",
      termsVersion: "2026-09-21",
      privacyVersionAcknowledged: "2026-09-21",
      source: LegalAcceptanceSource.BILLING_CHECKOUT,
      acceptedAt: firstAt,
    });
    await insertLegalAcceptance(writer, {
      clinicId: "clinic_1",
      userId: "user_1",
      termsVersion: "2026-10-01",
      privacyVersionAcknowledged: "2026-10-01",
      source: LegalAcceptanceSource.BILLING_CHECKOUT,
      acceptedAt: secondAt,
    });

    expect(db.rows).toHaveLength(2);
    expect(db.rows[0]).toMatchObject({
      termsVersion: "2026-09-21",
      privacyVersionAcknowledged: "2026-09-21",
      acceptedAt: firstAt,
    });
    expect(db.rows[1]?.termsVersion).toBe("2026-10-01");
    expect(db.update).not.toHaveBeenCalled();
  });
});

function memoryDb() {
  const rows: Array<Record<string, unknown>> = [];
  const update = vi.fn();
  return {
    rows,
    update,
    legalAcceptance: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `acc_${rows.length + 1}`, ...data };
        rows.push(row);
        return row;
      },
      update,
      findFirst: async () => rows[0] ?? null,
    },
  };
}
