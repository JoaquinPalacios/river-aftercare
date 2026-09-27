import { assessLocationToNewAccount } from "@/lib/account-split/location-policy";
import {
  assessAccountSplit,
  type AccountSplitAssessment,
  type AccountSplitSnapshot,
} from "@/lib/account-split/policy";
import { assessSiteToExistingGroup } from "@/lib/account-split/site-to-existing-group-policy";

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
  if (snapshot.preparation.operationKind === "SITE_TO_EXISTING_GROUP") {
    return assessSiteToExistingGroup(snapshot);
  }
  return assessAccountSplit(snapshot);
}
