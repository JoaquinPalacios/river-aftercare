"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const HISTORY_MARKER = "riverStaffUnsaved";

type GuardHistoryState = {
  riverStaffUnsaved?: boolean;
} | null;

function currentPath(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function historyState(): GuardHistoryState {
  return window.history.state as GuardHistoryState;
}

/**
 * Guards in-app link clicks and document unload while `dirty` is true.
 *
 * Browser Back uses a same-URL history sentinel rather than a global
 * `history.pushState` patch. Next.js 16 App Router has no `beforePopState`.
 * Its popstate listener reloads the document when the history state has no
 * `__NA` marker, and its own `pushState` wrapper starts a route restore
 * whenever a URL is passed. The sentinel therefore omits the URL argument so
 * Next copies `__NA` and does not restore. The first Back stays on this page
 * and opens the dialog. Leave without saving then moves two entries back.
 * A cross-route pop that lands before the sentinel can be restored only by
 * pushing the guarded URL, which App Router may treat as a restore.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState<string | null>(null);
  const historyLeaveRef = useRef(false);
  const navigatingAwayRef = useRef(false);
  const bypassPopRef = useRef(false);
  const openRef = useRef(false);
  const guardedPathRef = useRef<string | null>(null);
  openRef.current = open;

  const requestLeave = useCallback(
    (nextHref: string) => {
      if (!dirty || navigatingAwayRef.current) {
        router.push(nextHref);
        return;
      }

      historyLeaveRef.current = false;
      setHref(nextHref);
      setOpen(true);
    },
    [dirty, router]
  );

  const beginLeaving = useCallback(() => {
    navigatingAwayRef.current = true;
  }, []);

  const finishLeave = useCallback(
    (nextHref: string | null, viaHistory: boolean) => {
      navigatingAwayRef.current = true;
      historyLeaveRef.current = false;
      setOpen(false);
      setHref(null);
      if (viaHistory) {
        bypassPopRef.current = true;
        window.history.go(-2);
        return;
      }
      if (nextHref) {
        router.push(nextHref);
      }
    },
    [router]
  );

  const hrefRef = useRef(href);
  hrefRef.current = href;

  const keepEditing = useCallback(() => {
    historyLeaveRef.current = false;
    setOpen(false);
    setHref(null);
  }, []);

  const discard = useCallback(() => {
    finishLeave(hrefRef.current, historyLeaveRef.current);
  }, [finishLeave]);

  useEffect(() => {
    if (!dirty) {
      return;
    }

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (navigatingAwayRef.current) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) {
      return;
    }

    const onClick = (event: MouseEvent) => {
      if (
        navigatingAwayRef.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (!target || target.closest("dialog")) {
        return;
      }

      const anchor = target.closest("a");
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      ) {
        return;
      }

      const raw = anchor.getAttribute("href");
      if (
        !raw ||
        raw.startsWith("#") ||
        raw.startsWith("mailto:") ||
        raw.startsWith("tel:")
      ) {
        return;
      }

      const next = new URL(raw, window.location.href);
      if (next.origin !== window.location.origin) {
        return;
      }

      if (
        next.pathname === window.location.pathname &&
        next.search === window.location.search
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      requestLeave(`${next.pathname}${next.search}${next.hash}`);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty, requestLeave]);

  useEffect(() => {
    if (!dirty) {
      return;
    }

    guardedPathRef.current = currentPath();
    window.history.pushState({ [HISTORY_MARKER]: true }, "");

    const onPopState = (event: PopStateEvent) => {
      if (bypassPopRef.current) {
        bypassPopRef.current = false;
        return;
      }
      if (navigatingAwayRef.current) {
        return;
      }

      const guarded = guardedPathRef.current;
      if (!guarded) {
        return;
      }

      event.stopImmediatePropagation();
      const landed = currentPath();
      if (openRef.current && landed === guarded) {
        window.history.pushState({ [HISTORY_MARKER]: true }, "");
        return;
      }

      if (landed === guarded) {
        window.history.pushState({ [HISTORY_MARKER]: true }, "");
        historyLeaveRef.current = true;
        setHref(null);
        setOpen(true);
        return;
      }

      window.history.pushState({ [HISTORY_MARKER]: true }, "", guarded);
      historyLeaveRef.current = false;
      setHref(landed);
      setOpen(true);
    };

    window.addEventListener("popstate", onPopState, true);
    return () => {
      window.removeEventListener("popstate", onPopState, true);
      if (
        !navigatingAwayRef.current &&
        historyState()?.riverStaffUnsaved &&
        currentPath() === guardedPathRef.current
      ) {
        bypassPopRef.current = true;
        window.history.back();
      }
    };
  }, [dirty]);

  return {
    open,
    href,
    requestLeave,
    keepEditing,
    discard,
    beginLeaving,
  };
}
