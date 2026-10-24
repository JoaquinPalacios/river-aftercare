export const PRACTICE_SECTION_NAV = [
  { id: "practice-identity", label: "Identity" },
  { id: "practice-branding", label: "Branding" },
  { id: "practice-contact", label: "Contact" },
  { id: "practice-emergency", label: "Emergency" },
  { id: "practice-presentation", label: "Presentation" },
] as const;

export type PracticeSectionId = (typeof PRACTICE_SECTION_NAV)[number]["id"];

/** How close scrollTop must be to the maximum before the last section wins. */
export const PRACTICE_SECTION_BOTTOM_SLACK_PX = 4;

export function selectPracticeSection({
  scrollTop,
  maxScroll,
  activationOffset,
  sections,
  bottomSlack = PRACTICE_SECTION_BOTTOM_SLACK_PX,
}: {
  scrollTop: number;
  maxScroll: number;
  activationOffset: number;
  sections: readonly { id: PracticeSectionId; top: number }[];
  bottomSlack?: number;
}): PracticeSectionId | null {
  if (sections.length === 0) {
    return null;
  }

  const ordered = [...sections].sort((left, right) => left.top - right.top);
  const limit = Math.max(0, maxScroll);
  if (limit > 0 && scrollTop >= limit - bottomSlack) {
    return ordered[ordered.length - 1].id;
  }

  const line = scrollTop + Math.max(0, activationOffset);
  let active: PracticeSectionId = ordered[0].id;
  for (const section of ordered) {
    if (section.top <= line + 1) {
      active = section.id;
    } else {
      break;
    }
  }
  return active;
}

export function practiceSectionScrollTop({
  sectionTop,
  activationOffset,
  maxScroll,
}: {
  sectionTop: number;
  activationOffset: number;
  maxScroll: number;
}): number {
  const target = sectionTop - Math.max(0, activationOffset);
  const limit = Math.max(0, maxScroll);
  return Math.min(limit, Math.max(0, target));
}

function isViewportRoot(root: HTMLElement): boolean {
  return (
    root === document.scrollingElement ||
    root === document.documentElement ||
    root === document.body
  );
}

export function practiceScrollRoot(start: HTMLElement): HTMLElement {
  let node = start.parentElement;
  while (node) {
    const { overflowY } = window.getComputedStyle(node);
    if (
      overflowY === "auto" ||
      overflowY === "scroll" ||
      overflowY === "overlay"
    ) {
      return node;
    }
    node = node.parentElement;
  }
  const scrolling = document.scrollingElement;
  return scrolling instanceof HTMLElement
    ? scrolling
    : document.documentElement;
}

export function practiceSectionActivationOffset(section: HTMLElement): number {
  const margin = Number.parseFloat(
    window.getComputedStyle(section).scrollMarginTop
  );
  return Number.isFinite(margin) ? Math.max(0, margin) : 0;
}

export function practiceSectionContentTop(
  root: HTMLElement,
  section: HTMLElement
): number {
  const top = section.getBoundingClientRect().top;
  if (isViewportRoot(root)) {
    return top + window.scrollY;
  }
  return top - root.getBoundingClientRect().top + root.scrollTop;
}

function scrollEventTarget(root: HTMLElement): HTMLElement | Window {
  return isViewportRoot(root) ? window : root;
}

const SCROLL_KEYS = new Set([
  "ArrowDown",
  "ArrowUp",
  "PageDown",
  "PageUp",
  "Home",
  "End",
  " ",
]);

/**
 * Tracks the Practice section index from the element that actually scrolls.
 *
 * Desktop clinic pages scroll `.staffAppScroller`, not the window. The window
 * stays at 0 because the shell is a fixed viewport. `scrollIntoView` still
 * scrolls every ancestor, including that window, and sections that cannot
 * reach their scroll-margin leave `window.scrollY` above 0. The shell then
 * slides off the viewport and a blank region appears underneath.
 *
 * Clicks scroll only the practice scroll root, clamped to its real maximum.
 * The clicked section stays selected until that scroll settles. A later
 * manual scroll uses the same offset, and the bottom of the root always
 * selects Presentation even when that section cannot reach the offset.
 */
export function attachPracticeSectionNav(
  anchor: HTMLElement,
  onActive: (id: PracticeSectionId) => void
): { scrollTo: (id: PracticeSectionId) => void; disconnect: () => void } {
  let root = practiceScrollRoot(anchor);
  let generation = 0;
  let alive = true;
  let animating = false;
  let suppress = false;
  let pinned: PracticeSectionId | null = null;
  let settleTop: number | null = null;
  let desiredTop: number | null = null;
  let finishAttempts = 0;
  let frame = 0;
  let idleTimer = 0;
  let endRoot: HTMLElement | Window | null = null;
  let endHandler: (() => void) | null = null;

  const publish = (id: PracticeSectionId | null) => {
    if (alive && id) {
      onActive(id);
    }
  };

  const snapshot = () => {
    const sections = PRACTICE_SECTION_NAV.flatMap((section) => {
      const element = document.getElementById(section.id);
      if (!(element instanceof HTMLElement)) {
        return [];
      }
      return [
        {
          id: section.id,
          top: practiceSectionContentTop(root, element),
          element,
        },
      ];
    });
    const activationOffset = sections[0]
      ? practiceSectionActivationOffset(sections[0].element)
      : 0;
    return {
      sections,
      activationOffset,
      scrollTop: root.scrollTop,
      maxScroll: Math.max(0, root.scrollHeight - root.clientHeight),
    };
  };

  const publishSpy = () => {
    const { sections, activationOffset, scrollTop, maxScroll } = snapshot();
    publish(
      selectPracticeSection({
        scrollTop,
        maxScroll,
        activationOffset,
        sections,
      })
    );
  };

  const clearEnd = () => {
    if (endRoot && endHandler) {
      endRoot.removeEventListener("scrollend", endHandler);
    }
    endRoot = null;
    endHandler = null;
    window.clearTimeout(idleTimer);
  };

  const finish = (gen: number) => {
    if (!alive || gen !== generation) {
      return;
    }
    if (
      desiredTop !== null &&
      Math.abs(root.scrollTop - desiredTop) > 2 &&
      finishAttempts < 8
    ) {
      finishAttempts += 1;
      armIdle(gen, 160);
      return;
    }
    const arrived =
      desiredTop === null || Math.abs(root.scrollTop - desiredTop) <= 2;
    animating = false;
    desiredTop = null;
    clearEnd();
    if (arrived && pinned) {
      settleTop = root.scrollTop;
      publish(pinned);
      return;
    }
    pinned = null;
    settleTop = null;
    publishSpy();
  };

  const armIdle = (gen: number, delay: number) => {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => finish(gen), delay);
  };

  const onScroll = () => {
    if (!alive || suppress) {
      return;
    }
    // Smooth scrolling moves through intermediate positions. Those events must
    // not clear the clicked section. A scroll that stops somewhere else is
    // released by finish(). Wheel, touch, keys, and the scrollbar call
    // interrupt() and hand control back immediately.
    if (animating) {
      armIdle(generation, 140);
      return;
    }
    if (settleTop !== null && Math.abs(root.scrollTop - settleTop) < 1) {
      return;
    }
    settleTop = null;
    pinned = null;
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(publishSpy);
  };

  const interrupt = () => {
    if (!alive || !animating) {
      return;
    }
    generation += 1;
    animating = false;
    pinned = null;
    settleTop = null;
    desiredTop = null;
    clearEnd();
    suppress = true;
    root.scrollTo({ top: root.scrollTop, behavior: "auto" });
    suppress = false;
    publishSpy();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!animating || !SCROLL_KEYS.has(event.key)) {
      return;
    }
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT")
    ) {
      return;
    }
    interrupt();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.target === root) {
      interrupt();
    }
  };

  let listening: HTMLElement | Window | null = null;

  const unbind = () => {
    if (!listening) {
      return;
    }
    listening.removeEventListener("scroll", onScroll);
    listening.removeEventListener("wheel", interrupt);
    listening.removeEventListener("touchstart", interrupt);
    if (listening instanceof HTMLElement) {
      listening.removeEventListener("pointerdown", onPointerDown);
    }
    listening = null;
  };

  const bind = (next: HTMLElement) => {
    root = next;
    const target = scrollEventTarget(next);
    target.addEventListener("scroll", onScroll, { passive: true });
    target.addEventListener("wheel", interrupt, { passive: true });
    target.addEventListener("touchstart", interrupt, { passive: true });
    if (target instanceof HTMLElement) {
      target.addEventListener("pointerdown", onPointerDown);
    }
    listening = target;
  };

  const realign = () => {
    if (!alive) {
      return;
    }
    const next = practiceScrollRoot(anchor);
    if (next !== root) {
      clearEnd();
      unbind();
      bind(next);
      animating = false;
      pinned = null;
      settleTop = null;
      desiredTop = null;
    }
    if (animating) {
      return;
    }
    if (!pinned) {
      publishSpy();
      return;
    }
    const section = document.getElementById(pinned);
    if (!(section instanceof HTMLElement)) {
      pinned = null;
      publishSpy();
      return;
    }
    const top = practiceSectionScrollTop({
      sectionTop: practiceSectionContentTop(root, section),
      activationOffset: practiceSectionActivationOffset(section),
      maxScroll: Math.max(0, root.scrollHeight - root.clientHeight),
    });
    if (Math.abs(root.scrollTop - top) > 2) {
      suppress = true;
      root.scrollTo({ top, behavior: "auto" });
      suppress = false;
    }
    settleTop = root.scrollTop;
    publish(pinned);
  };

  const observer =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          realign();
        });
  observer?.observe(anchor);
  const content = anchor.closest(".staffAppContent");
  if (content instanceof HTMLElement && content !== anchor) {
    observer?.observe(content);
  }

  bind(root);
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", realign);
  publishSpy();

  return {
    scrollTo(id) {
      if (!alive) {
        return;
      }
      const next = practiceScrollRoot(anchor);
      if (next !== root) {
        clearEnd();
        unbind();
        bind(next);
      }
      const section = document.getElementById(id);
      if (!(section instanceof HTMLElement)) {
        return;
      }
      const top = practiceSectionScrollTop({
        sectionTop: practiceSectionContentTop(root, section),
        activationOffset: practiceSectionActivationOffset(section),
        maxScroll: Math.max(0, root.scrollHeight - root.clientHeight),
      });
      generation += 1;
      const gen = generation;
      pinned = id;
      settleTop = null;
      desiredTop = top;
      finishAttempts = 0;
      publish(id);
      clearEnd();
      if (Math.abs(root.scrollTop - top) < 1) {
        animating = false;
        settleTop = root.scrollTop;
        desiredTop = null;
        return;
      }
      animating = true;
      const target = scrollEventTarget(root);
      const onEnd = () => finish(gen);
      endRoot = target;
      endHandler = onEnd;
      target.addEventListener("scrollend", onEnd);
      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      root.scrollTo({
        top,
        behavior: reduce ? "auto" : "smooth",
      });
      // Replaced as soon as scroll events arrive. This only settles a scroll
      // that never starts, or a browser without scrollend.
      armIdle(gen, reduce ? 60 : 1200);
    },
    disconnect() {
      alive = false;
      generation += 1;
      window.cancelAnimationFrame(frame);
      clearEnd();
      unbind();
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", realign);
      observer?.disconnect();
    },
  };
}
