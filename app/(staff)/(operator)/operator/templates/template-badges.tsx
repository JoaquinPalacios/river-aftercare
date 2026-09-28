export function TemplateOriginBadge({ isSample }: { isSample: boolean }) {
  return isSample ? (
    <span className="staffStatusPill" data-tone="warning">
      Sample
    </span>
  ) : (
    <span className="staffStatusPill" data-tone="published">
      Production
    </span>
  );
}

export function TemplateActivityBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="staffStatusPill" data-tone="success">
      Active
    </span>
  ) : (
    <span className="staffStatusPill" data-tone="inactive">
      Inactive
    </span>
  );
}

export function TemplateDraftBadge({
  version,
  reviewed,
}: {
  version: number;
  reviewed: boolean;
}) {
  return reviewed ? (
    <span className="staffStatusPill" data-tone="success">
      Draft v{version} reviewed
    </span>
  ) : (
    <span className="staffStatusPill" data-tone="draft">
      Draft v{version}
    </span>
  );
}
