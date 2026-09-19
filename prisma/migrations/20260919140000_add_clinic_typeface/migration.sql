-- CreateEnum
CREATE TYPE "ClinicTypeface" AS ENUM ('OPEN_SANS', 'ROBOTO', 'MONTSERRAT', 'LATO', 'POPPINS', 'INTER');

-- AlterTable
ALTER TABLE "ClinicProfile" ADD COLUMN "typeface" "ClinicTypeface";
