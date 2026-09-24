import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import {
  isDowngradeRetained,
  RETAINED_GUIDE_READ_ONLY_MESSAGE,
} from "@/lib/entitlements/downgrade-retention";

export function assertPracticeGuideWritable(guide: {
  downgradeRetainedAt: Date | null;
}): void {
  if (isDowngradeRetained(guide)) {
    throw new ClinicPortalError(
      RETAINED_GUIDE_READ_ONLY_MESSAGE,
      "retained_read_only"
    );
  }
}
