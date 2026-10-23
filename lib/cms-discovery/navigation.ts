const SAFE_PATH = /^\/(?!\/)[A-Za-z0-9/_-]*$/;
const TOUR_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const CMS_TOUR_HANDOFF_PARAM = "cmsTour";

export function isSafeDiscoveryPath(path: string): boolean {
  return SAFE_PATH.test(path);
}

/**
 * A CMS path, optionally with only the tour handoff query.
 * Used when Show me opens another page before that page's tour starts.
 */
export function isSafeDiscoveryHref(href: string): boolean {
  const query = href.indexOf("?");
  if (query === -1) {
    return isSafeDiscoveryPath(href);
  }

  const path = href.slice(0, query);
  if (!isSafeDiscoveryPath(path) || href.includes("#")) {
    return false;
  }

  const params = new URLSearchParams(href.slice(query + 1));
  const id = params.get(CMS_TOUR_HANDOFF_PARAM);
  return (
    Boolean(id) &&
    TOUR_ID.test(id ?? "") &&
    params.getAll(CMS_TOUR_HANDOFF_PARAM).length === 1 &&
    [...params.keys()].every((key) => key === CMS_TOUR_HANDOFF_PARAM)
  );
}

export function cmsTourHandoffHref(
  path: string,
  tourId: string
): string | null {
  const href = `${path}?${CMS_TOUR_HANDOFF_PARAM}=${tourId}`;
  return isSafeDiscoveryHref(href) ? href : null;
}

export function discoveryPathMatches(
  pathname: string,
  path: string,
  match: "exact" | "prefix" = "exact"
): boolean {
  const query = path.indexOf("?");
  const target = query === -1 ? path : path.slice(0, query);
  if (!isSafeDiscoveryPath(target)) {
    return false;
  }
  path = target;

  if (match === "exact") {
    return pathname === path;
  }

  return pathname === path || pathname.startsWith(`${path}/`);
}

/** Focused authoring screens keep their layout free of automatic cards. */
export function suppressesAutomaticDiscovery(pathname: string): boolean {
  return (
    pathname === "/guides/new" ||
    /^\/guides\/[^/]+\/edit(?:\/|$)/.test(pathname)
  );
}

export function pageHasUnsavedStaffEdits(): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  return (
    document.querySelector(
      '[data-save-state="unsaved"], [data-save-state="saving"]'
    ) !== null
  );
}

/**
 * Move to an in-app CMS path. Unsaved staff edits go through a real link
 * click so `useUnsavedChangesGuard` can confirm before leaving.
 */
export function requestCmsDiscoveryNavigation(
  path: string,
  router: { push: (href: string) => void }
): "pushed" | "guarded" | "ignored" {
  if (!isSafeDiscoveryHref(path) || typeof document === "undefined") {
    return "ignored";
  }

  if (pageHasUnsavedStaffEdits()) {
    const anchor = document.createElement("a");
    anchor.href = path;
    anchor.hidden = true;
    anchor.setAttribute("data-cms-discovery-route", path);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    return "guarded";
  }

  router.push(path);
  return "pushed";
}
