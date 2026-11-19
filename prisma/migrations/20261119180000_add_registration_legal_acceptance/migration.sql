-- Registration records the Terms and Privacy versions accepted before the
-- clinic exists. Checkout still requires a separate BILLING_CHECKOUT row.
-- Additive. Do not apply this migration to production from this change.

ALTER TYPE "LegalAcceptanceSource" ADD VALUE 'REGISTRATION';
