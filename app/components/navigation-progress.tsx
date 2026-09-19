"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  completeAppNavigation,
  getNavigationProgressSnapshot,
  installNavigationProgressInstrumentation,
  setCommittedNavigationHref,
  setNavigationProgressReducedMotion,
  subscribeToNavigationProgress,
  type NavigationProgressSnapshot,
} from "@/lib/navigation-progress";

import "./navigation-progress.css";

export function NavigationProgress() {
  const pathname = usePathname();
  const [snapshot, setSnapshot] = useState<NavigationProgressSnapshot>(() =>
    getNavigationProgressSnapshot()
  );

  useEffect(() => subscribeToNavigationProgress(setSnapshot), []);

  useEffect(() => {
    return installNavigationProgressInstrumentation();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setCommittedNavigationHref(window.location.href);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setNavigationProgressReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (snapshot.phase !== "delaying" && snapshot.phase !== "running") {
      return;
    }

    if (!snapshot.fromHref) {
      return;
    }

    try {
      const from = new URL(snapshot.fromHref);
      if (pathname !== from.pathname) {
        completeAppNavigation();
      }
    } catch {
      completeAppNavigation();
    }
  }, [pathname, snapshot.fromHref, snapshot.phase]);

  return (
    <div
      className="navigationProgress"
      data-navigation-progress=""
      data-phase={snapshot.phase}
      data-visible={snapshot.visible ? "true" : "false"}
      aria-hidden="true"
      style={{
        ["--progress-value" as string]: String(snapshot.value),
      }}
    >
      <span className="navigationProgressBar" />
    </div>
  );
}
