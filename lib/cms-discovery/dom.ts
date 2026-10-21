const TARGET_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isDiscoveryElementVisible(element: HTMLElement): boolean {
  if (element.closest("[inert], [hidden]")) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.visibility === "collapse"
  ) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function findVisibleDiscoveryTarget(
  id: string,
  options?: { outsideMenu?: boolean }
): HTMLElement | null {
  if (!TARGET_ID.test(id) || typeof document === "undefined") {
    return null;
  }

  const nodes = document.querySelectorAll(`[data-cms-discovery="${id}"]`);
  for (const node of nodes) {
    if (!(node instanceof HTMLElement) || !isDiscoveryElementVisible(node)) {
      continue;
    }
    if (options?.outsideMenu && node.closest("[data-cms-discovery-menu]")) {
      continue;
    }
    return node;
  }

  return null;
}

export function revealDiscoveryMenu(): void {
  if (
    typeof document === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return;
  }

  if (!window.matchMedia("(max-width: 767px)").matches) {
    return;
  }

  const menu = document.querySelector("[data-cms-discovery-menu]");
  if (!(menu instanceof HTMLElement) || !menu.hasAttribute("inert")) {
    return;
  }

  if (typeof menu.showPopover !== "function") {
    return;
  }

  menu.dataset.cmsDiscoveryOpened = "true";
  try {
    menu.showPopover();
  } catch {
    delete menu.dataset.cmsDiscoveryOpened;
  }
}

export function closeDiscoveryMenuIfOpened(): void {
  if (typeof document === "undefined") {
    return;
  }

  const menu = document.querySelector("[data-cms-discovery-menu]");
  if (
    !(menu instanceof HTMLElement) ||
    menu.dataset.cmsDiscoveryOpened !== "true"
  ) {
    return;
  }

  delete menu.dataset.cmsDiscoveryOpened;
  if (typeof menu.hidePopover === "function") {
    try {
      menu.hidePopover();
    } catch {
      // The menu may already be closed.
    }
  }
}
