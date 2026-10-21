const SAFE_PATH = /^\/(?!\/)[A-Za-z0-9/_-]*$/;

export function isSafeDiscoveryPath(path: string): boolean {
  return SAFE_PATH.test(path);
}

export function discoveryPathMatches(
  pathname: string,
  path: string,
  match: "exact" | "prefix" = "exact"
): boolean {
  if (!isSafeDiscoveryPath(path)) {
    return false;
  }

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
  if (!isSafeDiscoveryPath(path) || typeof document === "undefined") {
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
