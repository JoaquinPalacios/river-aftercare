-- Additive account-lifecycle tokens. Does not rewrite existing users,
-- password hashes, memberships, sessions, clinics, or Auth.js verification
-- tokens. Raw tokens are never stored.

-- CreateEnum
CREATE TYPE "AccountTokenType" AS ENUM ('INVITATION', 'PASSWORD_RESET');

-- CreateTable
CREATE TABLE "AccountToken" (
    "id" TEXT NOT NULL,
    "type" "AccountTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clinicId" TEXT,
    "role" "ClinicMembershipRole",
    "email" TEXT NOT NULL,
    "invitedByUserId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountToken_tokenHash_key" ON "AccountToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AccountToken_userId_type_idx" ON "AccountToken"("userId", "type");

-- CreateIndex
CREATE INDEX "AccountToken_clinicId_idx" ON "AccountToken"("clinicId");

-- CreateIndex
CREATE INDEX "AccountToken_invitedByUserId_idx" ON "AccountToken"("invitedByUserId");

-- At most one outstanding password-reset token per user.
-- Outstanding means unconsumed and unrevoked. Expiry is enforced in the
-- service layer (and by lookup); do not use NOW() in this predicate.
CREATE UNIQUE INDEX "AccountToken_outstandingPasswordReset_userId_key"
ON "AccountToken" ("userId")
WHERE "type" = 'PASSWORD_RESET'
  AND "consumedAt" IS NULL
  AND "revokedAt" IS NULL;

-- At most one outstanding invitation token per user + clinic.
CREATE UNIQUE INDEX "AccountToken_outstandingInvitation_userId_clinicId_key"
ON "AccountToken" ("userId", "clinicId")
WHERE "type" = 'INVITATION'
  AND "consumedAt" IS NULL
  AND "revokedAt" IS NULL;

-- Cross-field shape that Prisma cannot express. Service validation remains
-- authoritative for invitation role/clinic presence at creation time.
ALTER TABLE "AccountToken"
ADD CONSTRAINT "AccountToken_type_shape_check"
CHECK (
  (
    "type" = 'PASSWORD_RESET'
    AND "clinicId" IS NULL
    AND "role" IS NULL
    AND "invitedByUserId" IS NULL
  )
  OR
  (
    "type" = 'INVITATION'
    AND "clinicId" IS NOT NULL
    AND "role" IS NOT NULL
  )
);

-- AddForeignKey
ALTER TABLE "AccountToken" ADD CONSTRAINT "AccountToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountToken" ADD CONSTRAINT "AccountToken_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Inviter deletion must not delete the invitee's token.
ALTER TABLE "AccountToken" ADD CONSTRAINT "AccountToken_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
