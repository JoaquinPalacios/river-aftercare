import "server-only";

import { BILLING_NOTICE_CLAIM_STALE_MS } from "@/lib/billing/notices/constants";
import type { PlannedBillingEmail } from "@/lib/billing/notices/types";

export type BillingNoticeClaim = {
  clinicId: string;
  stripeSubscriptionId: string;
  kind: PlannedBillingEmail["kind"];
  eventKey: string;
  now: Date;
};

export type BillingNoticeStore = {
  claim(input: BillingNoticeClaim): Promise<"send" | "skip">;
  complete(
    input: BillingNoticeClaim & {
      result: { ok: true } | { ok: false; failureCode: string };
    }
  ): Promise<void>;
};

export type MemoryDeliveryRow = {
  clinicId: string;
  stripeSubscriptionId: string;
  kind: PlannedBillingEmail["kind"];
  eventKey: string;
  status: "PENDING" | "SENT" | "FAILED";
  attemptCount: number;
  lastAttemptAt: Date | null;
  sentAt: Date | null;
  failureCode: string | null;
};

function sameClaim(row: MemoryDeliveryRow, input: BillingNoticeClaim): boolean {
  return (
    row.clinicId === input.clinicId &&
    row.stripeSubscriptionId === input.stripeSubscriptionId &&
    row.kind === input.kind &&
    row.eventKey === input.eventKey
  );
}

export function createMemoryBillingNoticeStore(
  rows: MemoryDeliveryRow[] = []
): BillingNoticeStore & { rows: MemoryDeliveryRow[] } {
  return {
    rows,
    async claim(input) {
      const existing = rows.find((row) => sameClaim(row, input));
      if (!existing) {
        rows.push({
          clinicId: input.clinicId,
          stripeSubscriptionId: input.stripeSubscriptionId,
          kind: input.kind,
          eventKey: input.eventKey,
          status: "PENDING",
          attemptCount: 1,
          lastAttemptAt: input.now,
          sentAt: null,
          failureCode: null,
        });
        return "send";
      }
      if (existing.status === "SENT") {
        return "skip";
      }
      const attemptedAt = existing.lastAttemptAt?.getTime() ?? 0;
      if (
        existing.status === "PENDING" &&
        input.now.getTime() - attemptedAt < BILLING_NOTICE_CLAIM_STALE_MS
      ) {
        return "skip";
      }
      existing.status = "PENDING";
      existing.attemptCount += 1;
      existing.lastAttemptAt = input.now;
      existing.failureCode = null;
      return "send";
    },
    async complete(input) {
      const existing = rows.find((row) => sameClaim(row, input));
      if (!existing || existing.status === "SENT") {
        return;
      }
      if (input.result.ok) {
        existing.status = "SENT";
        existing.sentAt = input.now;
        existing.failureCode = null;
        return;
      }
      existing.status = "FAILED";
      existing.sentAt = null;
      existing.failureCode = input.result.failureCode;
    },
  };
}
