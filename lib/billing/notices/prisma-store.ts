import "server-only";

import { Prisma } from "@prisma/client";

import { BILLING_NOTICE_CLAIM_STALE_MS } from "@/lib/billing/notices/constants";
import type {
  BillingNoticeClaim,
  BillingNoticeStore,
} from "@/lib/billing/notices/store";
import { getPrisma } from "@/lib/prisma";

function claimWhere(input: BillingNoticeClaim) {
  return {
    clinicId: input.clinicId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    kind: input.kind,
    eventKey: input.eventKey,
  };
}

function isUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export function createPrismaBillingNoticeStore(): BillingNoticeStore {
  return {
    async claim(input) {
      const prisma = getPrisma();
      try {
        await prisma.billingNoticeDelivery.create({
          data: {
            ...claimWhere(input),
            status: "PENDING",
            attemptCount: 1,
            lastAttemptAt: input.now,
          },
        });
        return "send";
      } catch (error) {
        if (!isUniqueConflict(error)) {
          throw error;
        }
      }

      const staleBefore = new Date(
        input.now.getTime() - BILLING_NOTICE_CLAIM_STALE_MS
      );
      const updated = await prisma.billingNoticeDelivery.updateMany({
        where: {
          ...claimWhere(input),
          OR: [
            { status: "FAILED" },
            { status: "PENDING", lastAttemptAt: { lt: staleBefore } },
            { status: "PENDING", lastAttemptAt: null },
          ],
        },
        data: {
          status: "PENDING",
          attemptCount: { increment: 1 },
          lastAttemptAt: input.now,
          failureCode: null,
        },
      });
      return updated.count === 1 ? "send" : "skip";
    },
    async complete(input) {
      const prisma = getPrisma();
      if (input.result.ok) {
        await prisma.billingNoticeDelivery.updateMany({
          where: {
            ...claimWhere(input),
            status: { not: "SENT" },
          },
          data: {
            status: "SENT",
            sentAt: input.now,
            failureCode: null,
          },
        });
        return;
      }
      await prisma.billingNoticeDelivery.updateMany({
        where: {
          ...claimWhere(input),
          status: { not: "SENT" },
        },
        data: {
          status: "FAILED",
          sentAt: null,
          failureCode: input.result.failureCode,
        },
      });
    },
  };
}
