"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  closeDiscoveryMenuIfOpened,
  findVisibleDiscoveryTarget,
  revealDiscoveryMenu,
} from "@/lib/cms-discovery/dom";
import {
  keepTourCardOnScreen,
  placeTourCard,
  visibleLayoutSize,
  type DiscoveryRect,
  type TourCardPlacement,
} from "@/lib/cms-discovery/placement";
import type { CmsDiscoveryStep } from "@/lib/cms-discovery/types";

const SEEK_MS = 1500;
const SPOT_MOVE_MS = 400;
const CARD_MOVE_MS = 300;
const MOVE_EASE = "cubic-bezier(0.2, 0, 0, 1)";

type TourPhase = "seek" | "enter" | "move" | "shown";

type ShownStep = {
  step: CmsDiscoveryStep;
  index: number;
};

type FoundTarget =
  | { status: "ready"; element: HTMLElement }
  | { status: "wait" }
  | { status: "missing" };

function reducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function cssTimeMs(value: string): number {
  let max = 0;
  for (const part of value.split(",")) {
    const time = part.trim();
    if (time.endsWith("ms")) {
      max = Math.max(max, Number.parseFloat(time));
    } else if (time.endsWith("s")) {
      max = Math.max(max, Number.parseFloat(time) * 1000);
    }
  }
  return Number.isFinite(max) ? max : 0;
}

function readLiveRect(element: HTMLElement | null): DiscoveryRect | null {
  if (!element?.isConnected) {
    return null;
  }
  const rect = element.getBoundingClientRect();
  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    !Number.isFinite(rect.top) ||
    !Number.isFinite(rect.left)
  ) {
    return null;
  }
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function positive(values: Array<number | undefined>): number[] {
  return values.filter(
    (value): value is number => typeof value === "number" && value > 0
  );
}

function layoutViewport(): { width: number; height: number } {
  const visual = window.visualViewport;
  const widths = positive([
    document.documentElement?.clientWidth,
    window.innerWidth,
    visual?.width,
  ]);
  const heights = positive([
    document.documentElement?.clientHeight,
    window.innerHeight,
    visual?.height,
  ]);
  return {
    width: widths.length > 0 ? Math.min(...widths) : window.innerWidth,
    height: heights.length > 0 ? Math.min(...heights) : window.innerHeight,
  };
}

function readViewport(): { width: number; height: number } {
  const layout = layoutViewport();
  const screen = window.screen;
  return visibleLayoutSize({
    width: layout.width,
    height: layout.height,
    screenX: window.screenX,
    screenY: window.screenY,
    outerWidth: window.outerWidth,
    outerHeight: window.outerHeight,
    availWidth: screen?.availWidth,
    availHeight: screen?.availHeight,
  });
}

function releaseMenuCard(card: HTMLElement): boolean {
  card.style.transition = "";
  card.style.top = "";
  card.style.left = "";
  card.style.width = "";
  const rect = card.getBoundingClientRect();
  const viewport = layoutViewport();
  const visibleWidth =
    Math.min(rect.right, viewport.width) - Math.max(rect.left, 0);
  const visibleHeight =
    Math.min(rect.bottom, viewport.height) - Math.max(rect.top, 0);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    visibleWidth >= Math.min(rect.width, 160) &&
    visibleHeight >= 48
  );
}

function cardFits(card: HTMLElement, viewport = readViewport()): boolean {
  const rect = card.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    viewport.width > 0 &&
    viewport.height > 0 &&
    rect.left >= -1 &&
    rect.top >= -1 &&
    rect.right <= viewport.width + 1 &&
    rect.bottom <= viewport.height + 1
  );
}

function elementInView(element: HTMLElement | null): boolean {
  const rect = readLiveRect(element);
  if (!rect) {
    return false;
  }
  const viewport = readViewport();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.top + rect.height <= viewport.height + 1 &&
    rect.left + rect.width <= viewport.width + 1
  );
}

function fitCard(
  card: HTMLElement,
  target: DiscoveryRect | null
): TourCardPlacement {
  const viewport = readViewport();
  const placed = placeTourCard({
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    target,
    cardHeight: card.offsetHeight,
  });
  if (viewport.width <= 0 || viewport.height <= 0) {
    return placed;
  }
  card.style.top = `${placed.top}px`;
  card.style.left = `${placed.left}px`;
  card.style.width = `${placed.width}px`;
  const painted = card.getBoundingClientRect();
  if (painted.width <= 0 || painted.height <= 0) {
    return placed;
  }
  return keepTourCardOnScreen({
    placement: placed,
    card: {
      top: painted.top,
      left: painted.left,
      width: painted.width,
      height: painted.height,
    },
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
  });
}

function cardOnScreen(card: HTMLElement | null): boolean {
  if (!card) {
    return false;
  }
  const rect = card.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }
  const viewport = readViewport();
  return (
    rect.left >= -1 &&
    rect.top >= -1 &&
    rect.right <= viewport.width + 1 &&
    rect.bottom <= viewport.height + 1
  );
}

function inDiscoveryMenu(element: HTMLElement): boolean {
  return Boolean(element.closest("[data-cms-discovery-menu]"));
}

function placementsEqual(
  current: TourCardPlacement | null,
  next: TourCardPlacement
): boolean {
  if (!current) {
    return false;
  }
  if (
    current.top !== next.top ||
    current.left !== next.left ||
    current.width !== next.width
  ) {
    return false;
  }
  if (!current.spot || !next.spot) {
    return current.spot === next.spot;
  }
  return (
    current.spot.top === next.spot.top &&
    current.spot.left === next.spot.left &&
    current.spot.width === next.spot.width &&
    current.spot.height === next.spot.height
  );
}

function mobileViewport(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 767px)").matches
  );
}

/**
 * Find the step's control on this page. A mobile nav target opens the menu
 * and stays inside it. A visible page target leaves that menu closed.
 */
function locateStep(step: CmsDiscoveryStep): FoundTarget {
  const outside = findVisibleDiscoveryTarget(step.target, {
    outsideMenu: true,
  });
  if (outside) {
    closeDiscoveryMenuIfOpened();
    return { status: "ready", element: outside };
  }

  if (mobileViewport()) {
    revealDiscoveryMenu();
    const menu = document.querySelector("[data-cms-discovery-menu]");
    if (
      menu instanceof HTMLElement &&
      menu.dataset.cmsDiscoveryOpened === "true" &&
      menu.hasAttribute("inert")
    ) {
      return { status: "wait" };
    }
    const inside = findVisibleDiscoveryTarget(step.target);
    if (inside) {
      return { status: "ready", element: inside };
    }
  }

  return { status: "missing" };
}

function findFallback(step: CmsDiscoveryStep): HTMLElement | null {
  if (!step.fallbackTarget) {
    return null;
  }
  const outside = findVisibleDiscoveryTarget(step.fallbackTarget, {
    outsideMenu: true,
  });
  if (outside) {
    return outside;
  }
  if (!mobileViewport()) {
    return null;
  }
  revealDiscoveryMenu();
  return findVisibleDiscoveryTarget(step.fallbackTarget);
}

function focusable(container: HTMLElement): HTMLElement[] {
  return [
    ...container.querySelectorAll<HTMLElement>(
      "button:not(:disabled), [href], [tabindex]:not([tabindex='-1'])"
    ),
  ].filter((element) => element.tabIndex >= 0);
}

function dialogIsOpen(): boolean {
  return Boolean(document.querySelector("dialog[open]"));
}

/**
 * Run `done` when the card's fade finishes. A zero duration, including
 * reduced motion and jsdom without the staff stylesheet, completes now.
 * The timer only covers a transition that never reports completion.
 */
function afterCardFade(card: HTMLElement, done: () => void): () => void {
  if (reducedMotion()) {
    done();
    return () => undefined;
  }
  const style = window.getComputedStyle(card);
  const duration = Math.max(
    cssTimeMs(style.animationDuration),
    cssTimeMs(style.transitionDuration)
  );
  if (duration === 0) {
    done();
    return () => undefined;
  }

  let settled = false;
  const finish = () => {
    if (settled) {
      return;
    }
    settled = true;
    done();
  };
  const onAnimation = (event: AnimationEvent) => {
    if (event.target === card) {
      finish();
    }
  };
  const onTransition = (event: TransitionEvent) => {
    if (event.target === card && event.propertyName === "opacity") {
      finish();
    }
  };
  card.addEventListener("animationend", onAnimation);
  card.addEventListener("transitionend", onTransition);
  const timer = window.setTimeout(finish, duration + 50);
  return () => {
    settled = true;
    card.removeEventListener("animationend", onAnimation);
    card.removeEventListener("transitionend", onTransition);
    window.clearTimeout(timer);
  };
}

function boxFromStyle(
  element: HTMLElement,
  fallback: DiscoveryRect
): DiscoveryRect {
  const style = window.getComputedStyle(element);
  const top = Number.parseFloat(style.top);
  const left = Number.parseFloat(style.left);
  const width = Number.parseFloat(style.width);
  const height = Number.parseFloat(style.height);
  if ([top, left, width, height].every((value) => Number.isFinite(value))) {
    return { top, left, width, height };
  }
  return fallback;
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
  const titleId = useId();
  const bodyId = useId();
  const hintId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const placementRef = useRef<TourCardPlacement | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const phaseRef = useRef<TourPhase>("seek");
  const stepRef = useRef(step);
  const indexRef = useRef(index);
  stepRef.current = step;
  indexRef.current = index;

  const [shown, setShown] = useState<ShownStep>({ step, index });
  const [phase, setPhase] = useState<TourPhase>("seek");
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [placement, setPlacement] = useState<TourCardPlacement | null>(null);
  const [anchored, setAnchored] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  phaseRef.current = phase;

  const onNextRef = useRef(onNext);
  const onBackRef = useRef(onBack);
  const onSkipRef = useRef(onSkip);
  onNextRef.current = onNext;
  onBackRef.current = onBack;
  onSkipRef.current = onSkip;

  function publishPlacement(next: TourCardPlacement) {
    placementRef.current = next;
    setPlacement((current) =>
      placementsEqual(current, next) ? current : next
    );
  }

  function rememberTarget(element: HTMLElement | null) {
    if (element && !elementInView(element) && element.scrollIntoView) {
      try {
        element.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "auto",
        });
      } catch {
        // jsdom does not implement scrolling.
      }
    }
    targetRef.current = element;
    setTarget(element);
  }

  function showFound(element: HTMLElement | null) {
    phaseRef.current = "enter";
    setAnchored(false);
    setShown({ step: stepRef.current, index: indexRef.current });
    rememberTarget(element);
    setPhase("enter");
  }

  useEffect(() => {
    const previous = document.activeElement;
    return () => {
      closeDiscoveryMenuIfOpened();
      const layer = layerRef.current;
      if (
        layer?.isConnected &&
        layer.matches(":popover-open") &&
        typeof layer.hidePopover === "function"
      ) {
        try {
          layer.hidePopover();
        } catch {
          // The layer is already closing.
        }
      }
      if (previous instanceof HTMLElement) {
        previous.focus();
      }
    };
  }, []);

  useEffect(() => {
    const sync = () => setDialogOpen(dialogIsOpen());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (step.id === shown.step.id) {
      return;
    }

    const found = locateStep(step);
    if (found.status === "wait") {
      setAnchored(false);
      setShown({ step, index });
      setPhase("seek");
      return;
    }

    const nextElement =
      found.status === "ready" ? found.element : findFallback(step);
    const current = targetRef.current;
    const bothInMenu = Boolean(
      nextElement &&
      current &&
      inDiscoveryMenu(current) &&
      inDiscoveryMenu(nextElement)
    );

    if (nextElement && !elementInView(nextElement)) {
      try {
        nextElement.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "auto",
        });
      } catch {
        // jsdom does not implement scrolling.
      }
    }

    if (bothInMenu && nextElement) {
      setShown({ step, index });
      rememberTarget(nextElement);
      setPhase("shown");
      return;
    }

    const canGlide =
      !reducedMotion() &&
      nextElement instanceof HTMLElement &&
      !inDiscoveryMenu(nextElement) &&
      current instanceof HTMLElement &&
      current.isConnected &&
      !inDiscoveryMenu(current) &&
      elementInView(current) &&
      elementInView(nextElement) &&
      cardOnScreen(cardRef.current);

    setShown({ step, index });
    if (nextElement) {
      rememberTarget(nextElement);
      setPhase(canGlide ? "move" : "shown");
      return;
    }

    setAnchored(false);
    targetRef.current = null;
    setTarget(null);
    setPhase("seek");
  }, [index, shown.step.id, step]);

  useLayoutEffect(() => {
    if (phase !== "seek" || dialogOpen || dialogIsOpen()) {
      return;
    }
    const found = locateStep(step);
    if (found.status === "ready") {
      showFound(found.element);
      return;
    }
    if (found.status === "missing") {
      showFound(findFallback(step));
    }
  }, [dialogOpen, phase, step]);

  useEffect(() => {
    if (phaseRef.current !== "seek") {
      return;
    }
    let cancelled = false;
    const started = performance.now();

    const look = () => {
      if (cancelled || phaseRef.current !== "seek") {
        return;
      }
      if (dialogIsOpen()) {
        return;
      }
      const found = locateStep(stepRef.current);
      if (found.status === "ready") {
        showFound(found.element);
        return;
      }
      if (found.status === "wait" && performance.now() - started < SEEK_MS) {
        return;
      }
      showFound(findFallback(stepRef.current));
    };

    look();
    const observer = new MutationObserver(look);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open", "inert", "hidden"],
    });
    const timer = window.setTimeout(look, SEEK_MS);
    return () => {
      cancelled = true;
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [phase, step]);

  useEffect(() => {
    if (phase !== "shown" && phase !== "enter") {
      return;
    }
    const look = () => {
      if (phaseRef.current !== "shown" && phaseRef.current !== "enter") {
        return;
      }
      const found = locateStep(stepRef.current);
      if (found.status !== "ready") {
        return;
      }
      const current = targetRef.current;
      if (current === found.element) {
        return;
      }
      if (
        current?.getAttribute("data-cms-discovery") === stepRef.current.target
      ) {
        return;
      }
      rememberTarget(found.element);
    };
    const observer = new MutationObserver(look);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["hidden", "inert", "open"],
    });
    return () => observer.disconnect();
  }, [phase, step]);

  useLayoutEffect(() => {
    if (phase !== "enter" && phase !== "move" && phase !== "shown") {
      return;
    }
    const card = cardRef.current;
    if (!card || dialogOpen) {
      return;
    }

    const layer = layerRef.current;
    const menuTarget = Boolean(target?.closest("[data-cms-discovery-menu]"));
    if (!menuTarget && layer && typeof layer.showPopover === "function") {
      try {
        if (!layer.matches(":popover-open")) {
          layer.showPopover();
        }
      } catch {
        // Already open.
      }
    }

    if (menuTarget) {
      setAnchored(releaseMenuCard(card));
      return;
    }

    const live = readLiveRect(target);
    if (!live && placementRef.current?.spot && phase !== "enter") {
      return;
    }
    const previous = placementRef.current;
    const startSpot = spotRef.current
      ? boxFromStyle(
          spotRef.current,
          previous?.spot ?? { top: 0, left: 0, width: 0, height: 0 }
        )
      : null;
    const startCard = boxFromStyle(card, {
      top: previous?.top ?? 0,
      left: previous?.left ?? 0,
      width: previous?.width ?? card.offsetWidth,
      height: card.offsetHeight,
    });
    if (spotRef.current) {
      spotRef.current.style.transition = "";
    }
    card.style.transition = "";
    const next = fitCard(card, live);
    if (
      phase === "move" &&
      !menuTarget &&
      previous?.spot &&
      next.spot &&
      spotRef.current &&
      startSpot
    ) {
      const spot = spotRef.current;
      const spotMove = `top ${SPOT_MOVE_MS}ms ${MOVE_EASE}, left ${SPOT_MOVE_MS}ms ${MOVE_EASE}, width ${SPOT_MOVE_MS}ms ${MOVE_EASE}, height ${SPOT_MOVE_MS}ms ${MOVE_EASE}`;
      spot.style.transition = "none";
      card.style.transition = "none";
      spot.style.top = `${startSpot.top}px`;
      spot.style.left = `${startSpot.left}px`;
      spot.style.width = `${startSpot.width}px`;
      spot.style.height = `${startSpot.height}px`;
      card.style.top = `${startCard.top}px`;
      card.style.left = `${startCard.left}px`;
      card.style.width = `${startCard.width}px`;
      void spot.offsetWidth;
      spot.style.transition = spotMove;
      card.style.transition = `top ${CARD_MOVE_MS}ms ${MOVE_EASE}, left ${CARD_MOVE_MS}ms ${MOVE_EASE}, width ${CARD_MOVE_MS}ms ${MOVE_EASE}, opacity ${CARD_MOVE_MS}ms ${MOVE_EASE}`;
      spot.style.top = `${next.spot.top}px`;
      spot.style.left = `${next.spot.left}px`;
      spot.style.width = `${next.spot.width}px`;
      spot.style.height = `${next.spot.height}px`;
      card.style.top = `${next.top}px`;
      card.style.left = `${next.left}px`;
      card.style.width = `${next.width}px`;
    }

    publishPlacement(next);
    setAnchored(phase === "move" || cardFits(card));
  }, [dialogOpen, phase, target]);

  useEffect(() => {
    if (phase !== "shown" && phase !== "enter") {
      return;
    }
    let frame = 0;
    let stopped = false;
    let lastKey = "";

    const tick = () => {
      if (stopped) {
        return;
      }
      frame = window.requestAnimationFrame(tick);
      if (phaseRef.current !== "shown" && phaseRef.current !== "enter") {
        return;
      }
      const card = cardRef.current;
      const liveTarget = targetRef.current;
      if (!card || !liveTarget) {
        return;
      }
      if (liveTarget.closest("[data-cms-discovery-menu]")) {
        const visible = releaseMenuCard(card);
        if (lastKey !== "menu" || !visible) {
          lastKey = visible ? "menu" : "";
          setAnchored(visible);
        }
        return;
      }
      const live = readLiveRect(liveTarget);
      if (!live) {
        return;
      }
      const viewport = readViewport();
      const key = [
        live.top,
        live.left,
        live.width,
        live.height,
        viewport.width,
        viewport.height,
      ]
        .map((value) => Math.round(value))
        .join(":");
      if (key === lastKey) {
        return;
      }
      lastKey = key;
      card.style.transition = "";
      if (spotRef.current) {
        spotRef.current.style.transition = "";
      }
      const next = fitCard(card, live);
      publishPlacement(next);
      setAnchored(cardFits(card));
    };

    frame = window.requestAnimationFrame(tick);
    return () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
    };
  }, [phase, target]);

  useEffect(() => {
    if (phase !== "enter") {
      return;
    }
    const card = cardRef.current;
    if (!card) {
      setPhase("shown");
      return;
    }
    return afterCardFade(card, () => {
      if (phaseRef.current === "enter") {
        setPhase("shown");
      }
    });
  }, [phase, shown.step.id]);

  useEffect(() => {
    if (phase !== "move") {
      return;
    }
    const timer = window.setTimeout(
      () => {
        if (phaseRef.current === "move") {
          setPhase("shown");
        }
      },
      reducedMotion() ? 0 : SPOT_MOVE_MS
    );
    return () => window.clearTimeout(timer);
  }, [phase, target]);

  useEffect(() => {
    if (phase !== "enter" && phase !== "shown" && phase !== "move") {
      return;
    }
    const card = cardRef.current;
    if (!card) {
      return;
    }
    try {
      card.focus({ preventScroll: true });
    } catch {
      card.focus();
    }
  }, [phase, shown.step.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onSkipRef.current();
        return;
      }

      if (phase !== "shown" && phase !== "move") {
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
  }, [index, phase]);

  useEffect(() => {
    if (!target?.closest("[data-cms-discovery-menu]")) {
      return;
    }
    const onClick = (event: MouseEvent) => {
      const node = event.target;
      if (!(node instanceof Element)) {
        return;
      }
      const anchor = node.closest("a");
      if (!anchor?.closest("[data-cms-discovery-menu]")) {
        return;
      }
      if (cardRef.current?.contains(anchor)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [target]);

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

  const visible =
    !dialogOpen && (phase === "enter" || phase === "move" || phase === "shown");
  if (!visible || typeof document === "undefined") {
    return null;
  }

  const stepping = phase === "shown" || phase === "move";
  const last = shown.index === total - 1;
  const ready = anchored || phase === "move";
  const cardStyle = placement
    ? {
        top: `${placement.top}px`,
        left: `${placement.left}px`,
        width: `${placement.width}px`,
        opacity: ready ? 1 : 0,
      }
    : {
        top: "50%",
        left: "50%",
        width: "min(22rem, calc(100vw - 2rem))",
        transform: "translate(-50%, -50%)",
        opacity: ready ? 1 : 0,
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
      data-cms-tour-step={shown.step.id}
      data-cms-tour-motion={ready ? phase : "pending"}
      data-cms-tour-ready={ready ? "true" : "false"}
      data-cms-tour-placement={
        inMenu ? "menu" : placement?.spot ? "target" : "fallback"
      }
      style={inMenu ? undefined : cardStyle}
    >
      <div className="cmsTourCardCopy">
        <p className="cmsTourProgress">
          {shown.index + 1} of {total}
        </p>
        <h2 id={titleId} className="cmsDiscoveryTitle">
          {shown.step.title}
        </h2>
        <p id={bodyId} className="cmsDiscoveryBody">
          {shown.step.body}
        </p>
      </div>
      <p id={hintId} className="sr-only">
        Use Next and Back to move through the tour. Escape skips it.
      </p>
      <div className="cmsTourActions">
        <button
          type="button"
          className="staffBtn staffBtnQuiet cmsTourSkip"
          onClick={() => onSkipRef.current()}
        >
          Skip tour
        </button>
        <button
          type="button"
          className="staffBtn staffBtnSecondary"
          onClick={() => {
            if (stepping && index > 0) {
              onBackRef.current();
            }
          }}
          disabled={!stepping || index === 0}
        >
          Back
        </button>
        <button
          type="button"
          className="staffBtn staffBtnPrimary"
          onClick={() => {
            if (stepping) {
              onNextRef.current();
            }
          }}
          disabled={!stepping}
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
          ref={spotRef}
          className="cmsTourSpot"
          data-cms-tour-spot="true"
          data-cms-tour-motion={ready ? phase : "pending"}
          data-cms-tour-ready={ready ? "true" : "false"}
          style={{
            top: `${placement.spot.top}px`,
            left: `${placement.spot.left}px`,
            width: `${placement.spot.width}px`,
            height: `${placement.spot.height}px`,
            opacity: ready ? 1 : 0,
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
