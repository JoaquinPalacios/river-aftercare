"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";

import {
  closeDiscoveryMenuIfOpened,
  findVisibleDiscoveryTarget,
  revealDiscoveryMenu,
} from "@/lib/cms-discovery/dom";
import {
  discoveryPathMatches,
  requestCmsDiscoveryNavigation,
} from "@/lib/cms-discovery/navigation";
import {
  placeTourCard,
  type TourCardPlacement,
} from "@/lib/cms-discovery/placement";
import type { CmsDiscoveryStep } from "@/lib/cms-discovery/types";

const TARGET_WAIT_MS = 8000;

function focusable(container: HTMLElement): HTMLElement[] {
  return [
    ...container.querySelectorAll<HTMLElement>(
      "button:not(:disabled), [href], [tabindex]:not([tabindex='-1'])"
    ),
  ].filter((element) => element.tabIndex >= 0);
}

export function GuidedTour({
  step,
  index,
  total,
  onNext,
  onBack,
  onSkip,
}: {
  step: CmsDiscoveryStep;
  index: number;
  total: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const pushRef = useRef(router.push);
  pushRef.current = router.push;
  const titleId = useId();
  const bodyId = useId();
  const hintId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  const [placement, setPlacement] = useState<TourCardPlacement | null>(null);
  const onNextRef = useRef(onNext);
  const onBackRef = useRef(onBack);
  const onSkipRef = useRef(onSkip);
  onNextRef.current = onNext;
  onBackRef.current = onBack;
  onSkipRef.current = onSkip;

  useEffect(() => {
    const previous = document.activeElement;
    return () => {
      closeDiscoveryMenuIfOpened();
      if (previous instanceof HTMLElement) {
        previous.focus();
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let settled = false;
    let requested = false;
    let shown: HTMLElement | null = null;
    const started = Date.now();
    let observer: MutationObserver | null = null;
    let timer = 0;

    const settle = (element: HTMLElement | null) => {
      if (cancelled || settled) {
        return;
      }
      settled = true;
      observer?.disconnect();
      window.clearTimeout(timer);
      if (shown !== element) {
        shown = element;
        setTarget(element);
      }
      setReady(true);
    };

    const show = (element: HTMLElement | null) => {
      if (cancelled || shown === element) {
        setReady(true);
        return;
      }
      shown = element;
      setTarget(element);
      setReady(true);
    };

    const look = () => {
      if (cancelled || settled) {
        return;
      }

      if (document.querySelector("dialog[open]")) {
        setReady(false);
        return;
      }

      const primaryOutside = findVisibleDiscoveryTarget(step.target, {
        outsideMenu: true,
      });
      if (primaryOutside) {
        closeDiscoveryMenuIfOpened();
        settle(primaryOutside);
        return;
      }

      const path = step.path;
      const onPath =
        !path ||
        discoveryPathMatches(pathname, path, step.pathMatch ?? "exact");
      if (!onPath && path && !requested) {
        requested = true;
        requestCmsDiscoveryNavigation(path, {
          push: (href) => pushRef.current(href),
        });
      }

      const fallbackOutside = step.fallbackTarget
        ? findVisibleDiscoveryTarget(step.fallbackTarget, {
            outsideMenu: true,
          })
        : null;
      const waited = Date.now() - started >= TARGET_WAIT_MS;
      if (!onPath && !waited) {
        if (fallbackOutside) {
          show(fallbackOutside);
        }
        return;
      }

      revealDiscoveryMenu();
      const primary = findVisibleDiscoveryTarget(step.target);
      if (primary) {
        settle(primary);
        return;
      }

      const menu = document.querySelector("[data-cms-discovery-menu]");
      if (
        !waited &&
        menu instanceof HTMLElement &&
        menu.dataset.cmsDiscoveryOpened === "true" &&
        menu.hasAttribute("inert")
      ) {
        return;
      }

      const fallback = step.fallbackTarget
        ? findVisibleDiscoveryTarget(step.fallbackTarget)
        : null;
      if (fallback) {
        show(fallback);
      }

      if (onPath || waited) {
        settle(fallback);
      }
    };

    setReady(false);
    setTarget(null);
    look();
    observer = new MutationObserver(look);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open", "inert", "hidden"],
    });
    timer = window.setTimeout(look, TARGET_WAIT_MS);

    return () => {
      cancelled = true;
      observer?.disconnect();
      window.clearTimeout(timer);
    };
  }, [pathname, step]);

  useLayoutEffect(() => {
    if (!ready || !cardRef.current) {
      return;
    }

    const layer = layerRef.current;
    const inMenu = Boolean(target?.closest("[data-cms-discovery-menu]"));
    if (!inMenu && layer && typeof layer.showPopover === "function") {
      try {
        layer.showPopover();
      } catch {
        // Already open.
      }
    }

    const measure = () => {
      const card = cardRef.current;
      if (!card) {
        return;
      }
      const rect = target?.getBoundingClientRect() ?? null;
      const visual = window.visualViewport;
      setPlacement(
        placeTourCard({
          viewportWidth: visual?.width ?? window.innerWidth,
          viewportHeight: visual?.height ?? window.innerHeight,
          target: rect
            ? {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
              }
            : null,
          cardHeight: card.offsetHeight,
        })
      );
    };

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      observer.observe(cardRef.current);
      if (target) {
        observer.observe(target);
      }
    }

    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, [ready, target]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    cardRef.current?.focus();
  }, [ready, step.id]);

  useEffect(() => {
    if (!target) {
      return;
    }

    if (typeof target.scrollIntoView !== "function") {
      return;
    }

    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: reduce ? "auto" : "smooth",
    });
  }, [target]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onSkipRef.current();
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        onNextRef.current();
        return;
      }

      if (event.key === "ArrowLeft") {
        if (index === 0) {
          return;
        }
        event.preventDefault();
        onBackRef.current();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const card = cardRef.current;
      if (!card) {
        return;
      }
      const items = focusable(card);
      if (items.length === 0) {
        event.preventDefault();
        card.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!first || !last) {
        return;
      }
      if (event.shiftKey && (active === first || !card.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !card.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [index, ready]);

  useLayoutEffect(() => {
    const menu = target?.closest("[data-cms-discovery-menu]");
    if (!(menu instanceof HTMLElement)) {
      return;
    }

    const fit = () => {
      const viewport = Math.min(
        window.innerHeight,
        window.visualViewport?.height ?? window.innerHeight
      );
      const top = menu.getBoundingClientRect().top;
      menu.style.maxHeight = `${Math.max(280, Math.floor(viewport - top - 16))}px`;
    };

    fit();
    window.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    return () => {
      menu.style.maxHeight = "";
      window.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("resize", fit);
    };
  }, [target]);

  useEffect(() => {
    if (!target?.closest("[data-cms-discovery-menu]")) {
      return;
    }

    target.classList.add("cmsTourTarget");
    if (typeof target.scrollIntoView === "function") {
      try {
        target.scrollIntoView({ block: "nearest", inline: "nearest" });
      } catch {
        // jsdom does not implement scrolling.
      }
    }
    return () => target.classList.remove("cmsTourTarget");
  }, [target]);

  if (!ready || typeof document === "undefined") {
    return null;
  }

  const last = index === total - 1;
  const cardStyle = placement
    ? {
        top: `${placement.top}px`,
        left: `${placement.left}px`,
        width: `${placement.width}px`,
      }
    : {
        top: "50%",
        left: "50%",
        width: "min(22rem, calc(100vw - 2rem))",
        transform: "translate(-50%, -50%)",
      };

  const menuHost = target?.closest("[data-cms-discovery-menu]");
  const inMenu = menuHost instanceof HTMLElement;
  const card = (
    <div
      ref={cardRef}
      className={inMenu ? "cmsTourCard cmsTourCardInMenu" : "cmsTourCard"}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={`${bodyId} ${hintId}`}
      tabIndex={-1}
      data-cms-tour-step={step.id}
      data-cms-tour-placement={
        inMenu ? "menu" : placement?.spot ? "target" : "fallback"
      }
      style={inMenu ? undefined : cardStyle}
    >
      <p className="cmsTourProgress">
        {index + 1} of {total}
      </p>
      <h2 id={titleId} className="cmsDiscoveryTitle">
        {step.title}
      </h2>
      <p id={bodyId} className="cmsDiscoveryBody">
        {step.body}
      </p>
      <p id={hintId} className="sr-only">
        Use Next and Back to move through the tour. Escape skips it.
      </p>
      <div className="cmsTourActions">
        <button
          type="button"
          className="staffBtn staffBtnQuiet cmsTourSkip"
          onClick={onSkip}
        >
          Skip tour
        </button>
        <button
          type="button"
          className="staffBtn staffBtnSecondary"
          onClick={onBack}
          disabled={index === 0}
        >
          Back
        </button>
        <button
          type="button"
          className="staffBtn staffBtnPrimary"
          onClick={onNext}
        >
          {last ? "Done" : "Next"}
        </button>
      </div>
    </div>
  );

  if (inMenu) {
    return createPortal(card, menuHost);
  }

  return createPortal(
    <div
      ref={layerRef}
      className="cmsTourLayer"
      popover="manual"
      data-cms-tour-layer="true"
    >
      <div
        className="cmsTourBlocker"
        data-dim={placement?.spot ? undefined : "page"}
      />
      {placement?.spot ? (
        <div
          className="cmsTourSpot"
          data-cms-tour-spot="true"
          style={{
            top: `${placement.spot.top}px`,
            left: `${placement.spot.left}px`,
            width: `${placement.spot.width}px`,
            height: `${placement.spot.height}px`,
          }}
        />
      ) : null}
      {card}
    </div>,
    document.body
  );
}

export function TourCompletion({
  title,
  body,
  onClose,
}: {
  title: string;
  body: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cardRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <>
      <div className="cmsTourBlocker" data-dim="page" />
      <div
        ref={cardRef}
        className="cmsTourCard"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        data-cms-tour-step="complete"
        style={{
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      >
        <h2 id={titleId} className="cmsDiscoveryTitle">
          {title}
        </h2>
        <p id={bodyId} className="cmsDiscoveryBody">
          {body}
        </p>
        <div className="cmsTourActions">
          <button
            type="button"
            className="staffBtn staffBtnPrimary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
