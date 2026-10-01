import "server-only";

import {
  createConfiguredBillingNoticeSender,
  deliverPlannedBillingEmails,
  logBillingNotice,
  type BillingNoticeDeliveryCounts,
  type BillingNoticeSender,
} from "@/lib/billing/notices/deliver";
import {
  evaluateCandidate,
  findBillingNoticeCandidates,
} from "@/lib/billing/notices/load";
import { createPrismaBillingNoticeStore } from "@/lib/billing/notices/prisma-store";
import type { BillingNoticeStore } from "@/lib/billing/notices/store";
import type { BillingNoticeCandidate } from "@/lib/billing/notices/types";

type Env = Record<string, string | undefined>;

export async function runBillingNoticeJob(options?: {
  now?: Date;
  env?: Env;
  sender?: BillingNoticeSender | null;
  store?: BillingNoticeStore;
  loadCandidates?: (now: Date) => Promise<BillingNoticeCandidate[]>;
}): Promise<BillingNoticeDeliveryCounts> {
  const now = options?.now ?? new Date();
  const env = options?.env ?? process.env;
  const store = options?.store ?? createPrismaBillingNoticeStore();
  const loadCandidates =
    options?.loadCandidates ??
    ((at: Date) => findBillingNoticeCandidates(at, env));
  const sender =
    options && "sender" in options
      ? (options.sender ?? null)
      : createConfiguredBillingNoticeSender(env);
  const candidates = await loadCandidates(now);
  const counts: BillingNoticeDeliveryCounts = {
    examined: candidates.length,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  for (const candidate of candidates) {
    const subscriptionId = candidate.subscription.stripeSubscriptionId;
    if (!subscriptionId) {
      counts.skipped += 1;
      continue;
    }
    const evaluation = evaluateCandidate(candidate, now, env);
    if (evaluation.priceChangeAmbiguous) {
      logBillingNotice({
        event: "billing_price_change_ambiguous",
        clinicId: candidate.clinicId,
      });
    }
    const delivered = await deliverPlannedBillingEmails({
      clinicId: candidate.clinicId,
      stripeSubscriptionId: subscriptionId,
      billingEmail: candidate.billingEmail,
      emails: evaluation.emails,
      now,
      store,
      sender,
    });
    counts.sent += delivered.sent;
    counts.failed += delivered.failed;
    counts.skipped += delivered.skipped;
  }

  return counts;
}
