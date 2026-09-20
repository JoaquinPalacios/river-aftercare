-- EMAIL_CHANGE outstanding uniqueness and token shape.
-- Additive. Existing INVITATION and PASSWORD_RESET rows remain valid.
-- river-aftercare:destructive-reviewed
-- DROP CONSTRAINT only widens AccountToken_type_shape_check to allow EMAIL_CHANGE.
-- No tables, columns, or rows are removed. Old production code ignores the new enum value.

CREATE UNIQUE INDEX "AccountToken_outstandingEmailChange_userId_key"
ON "AccountToken" ("userId")
WHERE "type" = 'EMAIL_CHANGE'
  AND "consumedAt" IS NULL
  AND "revokedAt" IS NULL;

CREATE UNIQUE INDEX "AccountToken_outstandingEmailChange_email_key"
ON "AccountToken" ("email")
WHERE "type" = 'EMAIL_CHANGE'
  AND "consumedAt" IS NULL
  AND "revokedAt" IS NULL;

ALTER TABLE "AccountToken" DROP CONSTRAINT "AccountToken_type_shape_check";

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
    "type" = 'EMAIL_CHANGE'
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
