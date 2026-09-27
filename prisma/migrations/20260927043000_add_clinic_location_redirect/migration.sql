-- Additive durable redirects for a future non-root Location move.
-- No production flow inserts these rows. Location splitting stays disabled.
--
-- A redirect preserves a published patient URL. Deleting a preparation or a
-- site must not erase it. Sites are not hard-deleted by the product; the
-- foreign keys still RESTRICT site deletion. preparationId is nullable and
-- ON DELETE SET NULL so removing a preparation keeps the redirect.

-- CreateTable
CREATE TABLE "ClinicLocationRedirect" (
    "id" TEXT NOT NULL,
    "sourceClinicSiteId" TEXT NOT NULL,
    "fromSlug" TEXT NOT NULL,
    "destinationClinicSiteId" TEXT NOT NULL,
    "preparationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicLocationRedirect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClinicLocationRedirect_sourceClinicSiteId_fromSlug_key" ON "ClinicLocationRedirect"("sourceClinicSiteId", "fromSlug");

-- CreateIndex
CREATE INDEX "ClinicLocationRedirect_destinationClinicSiteId_idx" ON "ClinicLocationRedirect"("destinationClinicSiteId");

-- CreateIndex
CREATE INDEX "ClinicLocationRedirect_preparationId_idx" ON "ClinicLocationRedirect"("preparationId");

-- AddForeignKey
ALTER TABLE "ClinicLocationRedirect" ADD CONSTRAINT "ClinicLocationRedirect_sourceClinicSiteId_fkey" FOREIGN KEY ("sourceClinicSiteId") REFERENCES "ClinicSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicLocationRedirect" ADD CONSTRAINT "ClinicLocationRedirect_destinationClinicSiteId_fkey" FOREIGN KEY ("destinationClinicSiteId") REFERENCES "ClinicSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicLocationRedirect" ADD CONSTRAINT "ClinicLocationRedirect_preparationId_fkey" FOREIGN KEY ("preparationId") REFERENCES "ClinicAccountSplitPreparation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Source and destination are different sites. One row is not a chain.
ALTER TABLE "ClinicLocationRedirect"
ADD CONSTRAINT "ClinicLocationRedirect_sites_distinct_check"
CHECK ("sourceClinicSiteId" <> "destinationClinicSiteId");

-- Same slug shape as ClinicLocation.slug.
ALTER TABLE "ClinicLocationRedirect"
ADD CONSTRAINT "ClinicLocationRedirect_from_slug_format_check"
CHECK (
    char_length("fromSlug") >= 3
    AND char_length("fromSlug") <= 32
    AND "fromSlug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
);
