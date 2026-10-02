export type LiveDemoCurrency = "current" | "older";

/**
 * Currency of the designated demo against the latest published sample.
 * Null means the read model cannot tell: there is no pin to compare, or the
 * pin matches the latest revision while the practice snapshot has drifted.
 */
export function liveDemoCurrency(adoption: {
  alreadyCurrent: boolean;
  pinnedRevisionVersion: number | null;
  latestPublishedRevisionVersion: number;
}): LiveDemoCurrency | null {
  if (adoption.alreadyCurrent) {
    return "current";
  }
  if (
    adoption.pinnedRevisionVersion !== null &&
    adoption.pinnedRevisionVersion < adoption.latestPublishedRevisionVersion
  ) {
    return "older";
  }
  return null;
}

export function liveDemoCurrencyLabel(currency: LiveDemoCurrency): string {
  if (currency === "current") {
    return "Live demo is up to date";
  }
  return "Live demo has an older published revision";
}

/**
 * The workspace and overview share this gate. A missing read model — including
 * a sample category with no designated demo — is not an actionable update.
 */
export function liveDemoUpdateOffered(
  adoption: { canUpdate: boolean } | null
): boolean {
  return adoption?.canUpdate === true;
}
