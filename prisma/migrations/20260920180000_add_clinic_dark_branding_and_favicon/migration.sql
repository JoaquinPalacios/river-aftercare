-- Optional clinic Dark branding and patient-guide favicon.
-- Existing primary/accent/logo values remain the Light/default brand.
-- New columns are nullable or default false so current clinics keep today's Dark fallback.

-- AlterTable
ALTER TABLE "ClinicProfile" ADD COLUMN "darkLogoUrl" TEXT;
ALTER TABLE "ClinicProfile" ADD COLUMN "faviconUrl" TEXT;
ALTER TABLE "ClinicProfile" ADD COLUMN "darkPrimaryColor" TEXT;
ALTER TABLE "ClinicProfile" ADD COLUMN "darkAccentColor" TEXT;
ALTER TABLE "ClinicProfile" ADD COLUMN "useCustomDarkBranding" BOOLEAN NOT NULL DEFAULT false;
