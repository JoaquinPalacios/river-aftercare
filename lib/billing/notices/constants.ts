import "server-only";

export const BILLING_NOTICE_DAY_MS = 24 * 60 * 60 * 1000;

export const ANNUAL_RENEWAL_NOTICE_DAYS = 30;

export const PRICE_INCREASE_NOTICE_DAYS = 30;

export const PRICE_INCREASE_REMINDER_DAYS = 7;

/** A claimed send that never finished can be retried after this interval. */
export const BILLING_NOTICE_CLAIM_STALE_MS = 15 * 60 * 1000;

export const BILLING_NOTICE_CRON_PATH = "/api/cron/billing-notices";

export const BILLING_NOTICE_PAGE_PATH = "/account/billing";

export const BILLING_PRICE_CHANGE_ANCHOR = "price-change";
