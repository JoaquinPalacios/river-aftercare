export function resolveUrl(href: string, base: string | URL): URL | null {
  try {
    return new URL(href, base);
  } catch {
    return null;
  }
}

export function navigationKey(url: URL): string {
  return `${url.origin}${url.pathname}${url.search}`;
}

export function isHashOnlyNavigation(from: URL, to: URL): boolean {
  return navigationKey(from) === navigationKey(to) && from.hash !== to.hash;
}

export function isQueryOnlyNavigation(from: URL, to: URL): boolean {
  return (
    from.origin === to.origin &&
    from.pathname === to.pathname &&
    from.search !== to.search
  );
}

export function isTrackedAppNavigation(from: URL, to: URL): boolean {
  if (to.protocol !== "http:" && to.protocol !== "https:") {
    return false;
  }

  if (from.origin !== to.origin) {
    return false;
  }

  if (navigationKey(from) === navigationKey(to)) {
    return false;
  }

  if (isQueryOnlyNavigation(from, to)) {
    return false;
  }

  return true;
}

export function isModifiedClick(
  event: Pick<
    MouseEvent,
    "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
  >
): boolean {
  return (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

export function appNavigationFromClick(
  event: MouseEvent,
  fromHref: string
): { from: URL; to: URL } | null {
  if (isModifiedClick(event)) {
    return null;
  }

  const target = event.target;
  if (!(target instanceof Element)) {
    return null;
  }

  const anchor = target.closest("a");
  if (!(anchor instanceof HTMLAnchorElement)) {
    return null;
  }

  if (anchor.hasAttribute("download")) {
    return null;
  }

  const linkTarget = anchor.getAttribute("target");
  if (linkTarget && linkTarget !== "" && linkTarget !== "_self") {
    return null;
  }

  const raw = anchor.getAttribute("href");
  if (
    !raw ||
    raw.startsWith("mailto:") ||
    raw.startsWith("tel:") ||
    raw.startsWith("javascript:")
  ) {
    return null;
  }

  const from = resolveUrl(fromHref, "http://local.test");
  const to = resolveUrl(anchor.href || raw, fromHref);
  if (!from || !to) {
    return null;
  }

  if (!isTrackedAppNavigation(from, to)) {
    return null;
  }

  return { from, to };
}
