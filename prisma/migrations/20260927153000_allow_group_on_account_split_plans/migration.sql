-- river-aftercare:destructive-reviewed
-- SITE_TO_EXISTING_GROUP records an existing Group Account on both sides.
-- The previous checks only allowed a new Essential or Practice shell and a
-- Practice source preview. This replaces those checks in place. It does not
-- drop tables, columns, or rows. Existing Essential, Practice, and Practice
-- preview values still satisfy the replacement checks.

ALTER TABLE "ClinicAccountSplitPreparation"
DROP CONSTRAINT "ClinicAccountSplitPreparation_destination_plan_check";

ALTER TABLE "ClinicAccountSplitPreparation"
ADD CONSTRAINT "ClinicAccountSplitPreparation_destination_plan_check"
CHECK ("destinationPlan" IN ('ESSENTIAL', 'PRACTICE', 'GROUP'));

ALTER TABLE "ClinicAccountSplitPreparation"
DROP CONSTRAINT "ClinicAccountSplitPreparation_target_source_plan_check";

ALTER TABLE "ClinicAccountSplitPreparation"
ADD CONSTRAINT "ClinicAccountSplitPreparation_target_source_plan_check"
CHECK ("targetSourcePlan" IN ('PRACTICE', 'GROUP'));
