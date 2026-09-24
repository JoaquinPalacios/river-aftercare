-- river-aftercare:destructive-reviewed
-- Legacy chairside schema only. Reviewed against the generated Prisma diff.
-- Does not alter Auth.js Session, Account, User, Clinic, or aftercare/billing tables.

-- DropForeignKey
ALTER TABLE "ProcedureTemplate" DROP CONSTRAINT "ProcedureTemplate_clinicId_fkey";

-- DropForeignKey
ALTER TABLE "ProcedureStageTemplate" DROP CONSTRAINT "ProcedureStageTemplate_procedureTemplateId_fkey";

-- DropForeignKey
ALTER TABLE "ProcedureTemplateSelectedAreaOption" DROP CONSTRAINT "ProcedureTemplateSelectedAreaOption_procedureTemplateId_fkey";

-- DropForeignKey
ALTER TABLE "Room" DROP CONSTRAINT "Room_clinicId_fkey";

-- DropForeignKey
ALTER TABLE "Doctor" DROP CONSTRAINT "Doctor_clinicId_fkey";

-- DropForeignKey
ALTER TABLE "ProcedureSession" DROP CONSTRAINT "ProcedureSession_clinicId_fkey";

-- DropForeignKey
ALTER TABLE "ProcedureSession" DROP CONSTRAINT "ProcedureSession_roomId_fkey";

-- DropForeignKey
ALTER TABLE "ProcedureSession" DROP CONSTRAINT "ProcedureSession_doctorId_fkey";

-- DropForeignKey
ALTER TABLE "ProcedureSession" DROP CONSTRAINT "ProcedureSession_procedureTemplateId_fkey";

-- DropForeignKey
ALTER TABLE "ProcedureSession" DROP CONSTRAINT "ProcedureSession_selectedAreaOptionId_fkey";

-- DropForeignKey
ALTER TABLE "SessionStageState" DROP CONSTRAINT "SessionStageState_procedureSessionId_fkey";

-- DropForeignKey
ALTER TABLE "SessionStageState" DROP CONSTRAINT "SessionStageState_currentStageTemplateId_fkey";

-- DropForeignKey
ALTER TABLE "PatientDisplayPreferences" DROP CONSTRAINT "PatientDisplayPreferences_procedureSessionId_fkey";

-- DropForeignKey
ALTER TABLE "ProcedureSessionStageOverride" DROP CONSTRAINT "ProcedureSessionStageOverride_procedureSessionId_fkey";

-- DropForeignKey
ALTER TABLE "ProcedureSessionStageOverride" DROP CONSTRAINT "ProcedureSessionStageOverride_procedureStageTemplateId_fkey";

-- DropForeignKey
ALTER TABLE "ProcedureSessionStageTransition" DROP CONSTRAINT "ProcedureSessionStageTransition_procedureSessionId_fkey";

-- DropTable
DROP TABLE "ProcedureTemplate";

-- DropTable
DROP TABLE "ProcedureStageTemplate";

-- DropTable
DROP TABLE "ProcedureTemplateSelectedAreaOption";

-- DropTable
DROP TABLE "Room";

-- DropTable
DROP TABLE "Doctor";

-- DropTable
DROP TABLE "ProcedureSession";

-- DropTable
DROP TABLE "SessionStageState";

-- DropTable
DROP TABLE "PatientDisplayPreferences";

-- DropTable
DROP TABLE "ProcedureSessionStageOverride";

-- DropTable
DROP TABLE "ProcedureSessionStageTransition";

-- DropEnum
DROP TYPE "ProcedureSessionStatus";

-- DropEnum
DROP TYPE "PatientDisplayMode";

-- DropEnum
DROP TYPE "ProcedureSessionStageTransitionDirection";
