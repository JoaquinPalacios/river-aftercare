import {
  appNavigationFromClick,
  isTrackedAppNavigation,
  resolveUrl,
} from "@/lib/navigation-progress/href";
import { NavigationProgressMachine } from "@/lib/navigation-progress/machine";
import type { NavigationProgressListener } from "@/lib/navigation-progress/machine";

const machine = new NavigationProgressMachine();

let committedHref =
  typeof window === "undefined" ? "http://local.test/" : window.location.href;
let instrumentationCount = 0;
let restoreHistory: (() => void) | null = null;

export function getNavigationProgressSnapshot() {
  return machine.getSnapshot();
}

export function subscribeToNavigationProgress(
  listener: NavigationProgressListener
): () => void {
  return machine.subscribe(listener);
}

export function setNavigationProgressReducedMotion(reduced: boolean): void {
  machine.setReducedMotion(reduced);
}

export function setCommittedNavigationHref(href: string): void {
  committedHref = href;
}

export function startAppNavigation(
  href: string,
  fromHref = committedHref
): void {
  if (typeof window === "undefined") {
    return;
  }

  const from = resolveUrl(fromHref, window.location.href);
  const to = resolveUrl(href, fromHref || window.location.href);
  if (!from || !to || !isTrackedAppNavigation(from, to)) {
    return;
  }

  machine.start(from.href, to.href);
}

export function completeAppNavigation(): void {
  machine.complete();
}

export function resetNavigationProgress(): void {
  machine.reset();
}

export function resetNavigationProgressForTests(): void {
  machine.reset();
  committedHref =
    typeof window === "undefined" ? "http://local.test/" : window.location.href;
}

function historyUrl(url: string | URL | null | undefined): URL | null {
  if (url == null || url === "") {
    return null;
  }

  return resolveUrl(String(url), window.location.href);
}

export function installNavigationProgressInstrumentation(): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  instrumentationCount += 1;
  if (instrumentationCount > 1) {
    return () => {
      instrumentationCount = Math.max(0, instrumentationCount - 1);
    };
  }

  committedHref = window.location.href;

  const onClick = (event: MouseEvent) => {
    // Observe only. Do not cancel the event — Next.js Link / the browser navigate.
    const navigation = appNavigationFromClick(event, committedHref);
    if (!navigation) {
      return;
    }

    machine.start(navigation.from.href, navigation.to.href);
  };

  const onPopState = () => {
    const from = resolveUrl(committedHref, window.location.href);
    const to = resolveUrl(window.location.href, window.location.href);
    if (!from || !to || !isTrackedAppNavigation(from, to)) {
      committedHref = window.location.href;
      return;
    }

    machine.start(from.href, to.href);
  };

  const originalPushState = window.history.pushState.bind(window.history);
  const originalReplaceState = window.history.replaceState.bind(window.history);

  const patch =
    (original: typeof window.history.pushState) =>
    (data: unknown, unused: string, url?: string | URL | null) => {
      const fromHref = window.location.href;
      const result = original(data, unused, url);
      const from = resolveUrl(fromHref, fromHref);
      const next =
        historyUrl(url) ??
        resolveUrl(window.location.href, window.location.href);
      if (from && next && isTrackedAppNavigation(from, next)) {
        machine.start(from.href, next.href);
      }
      return result;
    };

  window.history.pushState = patch(originalPushState);
  window.history.replaceState = patch(originalReplaceState);

  document.addEventListener("click", onClick);
  window.addEventListener("popstate", onPopState);

  restoreHistory = () => {
    window.history.pushState = originalPushState;
    window.history.replaceState = originalReplaceState;
    document.removeEventListener("click", onClick);
    window.removeEventListener("popstate", onPopState);
  };

  return () => {
    instrumentationCount = Math.max(0, instrumentationCount - 1);
    if (instrumentationCount === 0 && restoreHistory) {
      restoreHistory();
      restoreHistory = null;
    }
  };
}
