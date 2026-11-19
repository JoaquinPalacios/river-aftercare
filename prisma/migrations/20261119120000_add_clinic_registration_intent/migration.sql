-- Prospective clinic registration. Additive.
-- Does not create users, clinics, memberships, entitlements, or Stripe rows.
-- Do not apply this migration to production from this change.
--
-- A live intent is unconsumed and unrevoked. Expiry is service logic.
-- Do not put now() or expiresAt > now() in the partial unique index:
-- an expired row stays in that index until a transaction revokes it.

-- CreateTable
CREATE TABLE "ClinicRegistrationIntent" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "practiceName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "serviceCategories" "ServiceCategory"[] NOT NULL,
    "commercialPlan" "CommercialPlan" NOT NULL,
    "billingInterval" "BillingInterval" NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "privacyVersionAcknowledged" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicRegistrationIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClinicRegistrationIntent_tokenHash_key" ON "ClinicRegistrationIntent"("tokenHash");

-- CreateIndex
CREATE INDEX "ClinicRegistrationIntent_email_idx" ON "ClinicRegistrationIntent"("email");

-- CreateIndex
CREATE INDEX "ClinicRegistrationIntent_slug_idx" ON "ClinicRegistrationIntent"("slug");

-- CreateIndex
CREATE INDEX "ClinicRegistrationIntent_expiresAt_idx" ON "ClinicRegistrationIntent"("expiresAt");

-- At most one live intent per email. Live means unconsumed and unrevoked.
-- Expired rows remain in this index until the service revokes them.
CREATE UNIQUE INDEX "ClinicRegistrationIntent_live_email_key"
ON "ClinicRegistrationIntent" ("email")
WHERE "consumedAt" IS NULL
  AND "revokedAt" IS NULL;

-- The proposed slug is intentionally not unique. It is not a reservation.

ALTER TABLE "ClinicRegistrationIntent"
ADD CONSTRAINT "ClinicRegistrationIntent_shape_check"
CHECK (
  char_length("email") BETWEEN 3 AND 254
  AND "email" = lower("email")
  AND position(' ' in "email") = 0
  AND char_length("ownerName") BETWEEN 1 AND 80
  AND char_length("practiceName") BETWEEN 1 AND 80
  AND "slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  AND char_length("slug") BETWEEN 3 AND 32
  AND cardinality("serviceCategories") >= 1
  AND "commercialPlan"::text IN ('ESSENTIAL', 'PRACTICE')
  AND "billingInterval"::text IN ('MONTHLY', 'YEARLY')
  AND char_length("termsVersion") > 0
  AND char_length("privacyVersionAcknowledged") > 0
  AND "tokenHash" ~ '^[0-9a-f]{64}$'
  AND "passwordHash" ~ '^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$'
  AND ("consumedAt" IS NULL OR "revokedAt" IS NULL)
);
