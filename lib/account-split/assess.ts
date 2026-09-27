import { assessLocationToNewAccount } from "@/lib/account-split/location-policy";
import {
  assessAccountSplit,
  type AccountSplitAssessment,
  type AccountSplitSnapshot,
} from "@/lib/account-split/policy";

/**
 * Site splits and location moves share one preparation row and one read model.
 * Each operation keeps its own assessment. A site split never runs the
 * location-promotion rules.
 */
export function assessPreparedAccountStructure(
  snapshot: AccountSplitSnapshot
): AccountSplitAssessment {
  if (snapshot.preparation.operationKind === "LOCATION_TO_NEW_ACCOUNT") {
    return assessLocationToNewAccount(snapshot);
  }
  return assessAccountSplit(snapshot);
}
