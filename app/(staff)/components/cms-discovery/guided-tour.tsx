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
const SPOT_MOVE_MS = 400;
const CARD_MOVE_MS = 300;
const SPOT_REVEAL_MS = 280;
const TOUR_EASE = "cubic-bezier(0.2, 0, 0, 1)";

type TourMotion = "move" | "track" | "route" | "reveal";

function reducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function glide(
  element: HTMLElement,
  from: Record<string, string>,
  to: Record<string, string>,
  duration: number
) {
  if (reducedMotion() || typeof element.animate !== "function") {
    return;
  }

  const computed = window.getComputedStyle(element);
  const start: Record<string, string> = {};
  for (const key of Object.keys(from)) {
    const value = computed[key as keyof CSSStyleDeclaration];
    start[key] =
      typeof value === "string" && value.endsWith("px") ? value : from[key]!;
  }
  for (const animation of element.getAnimations?.() ?? []) {
    if (animation.id === "cms-tour-glide") {
      animation.cancel();
    }
  }
  const animation = element.animate([start, to], {
    duration,
    easing: TOUR_EASE,
    fill: "none",
  });
  animation.id = "cms-tour-glide";
}

function targetInView(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= viewportHeight + 1 &&
    rect.right <= viewportWidth + 1
  );
}

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
  const spotRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const placementRef = useRef<TourCardPlacement | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  const [placement, setPlacement] = useState<TourCardPlacement | null>(null);
  const [motion, setMotion] = useState<TourMotion>("reveal");
  const targetRef = useRef<HTMLElement | null>(null);
  const routePendingRef = useRef(false);
  const motionRef = useRef(motion);
  motionRef.current = motion;
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
      const pendingRoute = routePendingRef.current;
      routePendingRef.current = false;
      const previous = targetRef.current;
      const sameSurface =
        !pendingRoute &&
        previous instanceof HTMLElement &&
        previous.isConnected &&
        element instanceof HTMLElement;
      let nextMotion: TourMotion = "reveal";
      if (sameSurface && element && targetInView(element)) {
        nextMotion = "move";
      } else if (sameSurface) {
        nextMotion = "track";
      }
      targetRef.current = element;
      setTarget(element);
      setReady(true);
      setMotion(nextMotion);
    };

    const look = () => {
      if (cancelled || settled) {
        return;
      }

      if (document.querySelector("dialog[open]")) {
        setReady(false);
        return;
      }

      const path = step.path;
      const onPath =
        !path ||
        discoveryPathMatches(pathname, path, step.pathMatch ?? "exact");
      const waited = Date.now() - started >= TARGET_WAIT_MS;

      if (!onPath && path && !requested) {
        requested = true;
        routePendingRef.current = true;
        setMotion("route");
        requestCmsDiscoveryNavigation(path, {
          push: (href) => pushRef.current(href),
        });
      }

      if (!onPath && !waited) {
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
      if (onPath || waited) {
        settle(fallback);
      }
    };

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

    const measure = (animateMove: boolean) => {
      const card = cardRef.current;
      if (!card) {
        return;
      }
      const rect = target?.getBoundingClientRect() ?? null;
      const visual = window.visualViewport;
      const next = placeTourCard({
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
      });
      const previous = placementRef.current;
      placementRef.current = next;
      if (animateMove && previous && !inMenu && motionRef.current === "move") {
        const spot = spotRef.current;
        if (spot && previous.spot && next.spot) {
          glide(
            spot,
            {
              top: `${previous.spot.top}px`,
              left: `${previous.spot.left}px`,
              width: `${previous.spot.width}px`,
              height: `${previous.spot.height}px`,
            },
            {
              top: `${next.spot.top}px`,
              left: `${next.spot.left}px`,
              width: `${next.spot.width}px`,
              height: `${next.spot.height}px`,
            },
            SPOT_MOVE_MS
          );
        }
        glide(
          card,
          {
            top: `${previous.top}px`,
            left: `${previous.left}px`,
            width: `${previous.width}px`,
          },
          {
            top: `${next.top}px`,
            left: `${next.left}px`,
            width: `${next.width}px`,
          },
          CARD_MOVE_MS
        );
      } else if (motionRef.current !== "move") {
        for (const element of [spotRef.current, card]) {
          for (const animation of element?.getAnimations?.() ?? []) {
            if (animation.id === "cms-tour-glide") {
              animation.cancel();
            }
          }
        }
      }
      setPlacement(next);
    };

    const follow = () => {
      if (
        motionRef.current === "move" ||
        motionRef.current === "reveal" ||
        motionRef.current === "route"
      ) {
        return;
      }
      measure(false);
    };

    measure(motionRef.current === "move");
    window.addEventListener("resize", follow);
    window.addEventListener("scroll", follow, true);
    window.visualViewport?.addEventListener("resize", follow);
    window.visualViewport?.addEventListener("scroll", follow);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => measure(false));
      observer.observe(cardRef.current);
      if (target) {
        observer.observe(target);
      }
    }

    return () => {
      window.removeEventListener("resize", follow);
      window.removeEventListener("scroll", follow, true);
      window.visualViewport?.removeEventListener("resize", follow);
      window.visualViewport?.removeEventListener("scroll", follow);
      observer?.disconnect();
    };
  }, [motion, ready, target]);

  useEffect(() => {
    if (motion !== "move" && motion !== "reveal") {
      return;
    }

    const timer = window.setTimeout(
      () => setMotion("track"),
      motion === "move" ? SPOT_MOVE_MS : SPOT_REVEAL_MS
    );
    return () => window.clearTimeout(timer);
  }, [motion, target]);

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
        event.preventDefault();
        if (index === 0) {
          return;
        }
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
        opacity: motion === "route" ? 0 : 1,
      }
    : {
        top: "50%",
        left: "50%",
        width: "min(22rem, calc(100vw - 2rem))",
        transform: "translate(-50%, -50%)",
        opacity: motion === "route" ? 0 : 1,
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
      data-cms-tour-motion={motion}
      data-cms-tour-placement={
        inMenu
          ? "menu"
          : motion === "route"
            ? "pending"
            : placement?.spot
              ? "target"
              : "fallback"
      }
      style={inMenu ? undefined : cardStyle}
    >
      <div key={step.id} className="cmsTourCardCopy">
        <p className="cmsTourProgress">
          {index + 1} of {total}
        </p>
        <h2 id={titleId} className="cmsDiscoveryTitle">
          {step.title}
        </h2>
        <p id={bodyId} className="cmsDiscoveryBody">
          {step.body}
        </p>
      </div>
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
        data-dim={motion === "route" || !placement?.spot ? "page" : undefined}
      />
      {placement?.spot ? (
        <div
          ref={spotRef}
          className="cmsTourSpot"
          data-cms-tour-spot="true"
          data-cms-tour-motion={motion}
          style={{
            top: `${placement.spot.top}px`,
            left: `${placement.spot.left}px`,
            width: `${placement.spot.width}px`,
            height: `${placement.spot.height}px`,
            opacity: motion === "route" ? 0 : 1,
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
        className="cmsTourCard cmsTourCardEnter"
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
