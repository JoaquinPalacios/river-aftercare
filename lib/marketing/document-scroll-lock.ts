/**
 * Locks scrolling on the marketing document while the mobile menu is open.
 *
 * The public header is sticky and the menu is an anchored popover, so the
 * body is not pinned with `position: fixed`. That technique pulls a sticky
 * header out of the viewport and jumps the page. Overflow is clipped on the
 * document scroller instead. Background touch and wheel gestures are
 * cancelled so iOS Safari cannot rubber-band the page behind the menu. The
 * menu panel can still scroll when its content is taller than the viewport.
 *
 * Inline styles written here are restored to the values they had before the
 * lock. Scroll position is written back only if the browser moved it, and
 * that write is instant so `scroll-behavior: smooth` on `html` cannot
 * animate a jump.
 */

type ScrollPosition = {
  x: number;
  y: number;
};

type ScrollLockSnapshot = {
  htmlOverflow: string;
  htmlOverscrollBehavior: string;
  bodyOverflow: string;
  bodyOverscrollBehavior: string;
  bodyPaddingRight: string;
  position: ScrollPosition;
};

export type DocumentScrollLockOptions = {
  /** Panel that may scroll internally while the document is locked. */
  allowScrollWithin?: HTMLElement | null;
};

function readScrollPosition(): ScrollPosition {
  const scrolling = document.scrollingElement;
  return {
    x: window.scrollX || scrolling?.scrollLeft || 0,
    y: window.scrollY || scrolling?.scrollTop || 0,
  };
}

function holdScrollPosition(position: ScrollPosition) {
  const current = readScrollPosition();
  if (current.x === position.x && current.y === position.y) {
    return;
  }

  const root = document.documentElement;
  const previousScrollBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  window.scrollTo({
    top: position.y,
    left: position.x,
    behavior: "instant",
  });
  root.style.scrollBehavior = previousScrollBehavior;
}

function scrollbarWidth(): number {
  return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
}

function canElementScrollBy(element: HTMLElement, deltaY: number): boolean {
  if (deltaY === 0) {
    return false;
  }
  const maxScroll = element.scrollHeight - element.clientHeight;
  if (maxScroll <= 1) {
    return false;
  }
  if (deltaY < 0) {
    return element.scrollTop > 0;
  }
  return element.scrollTop < maxScroll - 1;
}

function gestureMayScroll(
  allow: HTMLElement | null | undefined,
  target: EventTarget | null,
  deltaY: number
): boolean {
  if (!allow || !(target instanceof Node) || !allow.contains(target)) {
    return false;
  }
  return canElementScrollBy(allow, deltaY);
}

function bindBackgroundGestureLock(allow: HTMLElement | null | undefined) {
  let lastTouchY: number | null = null;

  const onTouchStart = (event: TouchEvent) => {
    lastTouchY = event.touches[0]?.clientY ?? null;
  };

  const onTouchMove = (event: TouchEvent) => {
    const currentY = event.touches[0]?.clientY;
    const deltaY =
      lastTouchY == null || currentY == null ? 0 : lastTouchY - currentY;
    if (currentY != null) {
      lastTouchY = currentY;
    }
    if (gestureMayScroll(allow, event.target, deltaY)) {
      return;
    }
    event.preventDefault();
  };

  const onWheel = (event: WheelEvent) => {
    if (gestureMayScroll(allow, event.target, event.deltaY)) {
      return;
    }
    event.preventDefault();
  };

  document.addEventListener("touchstart", onTouchStart, {
    passive: true,
    capture: true,
  });
  document.addEventListener("touchmove", onTouchMove, {
    passive: false,
    capture: true,
  });
  document.addEventListener("wheel", onWheel, {
    passive: false,
    capture: true,
  });

  return () => {
    document.removeEventListener("touchstart", onTouchStart, true);
    document.removeEventListener("touchmove", onTouchMove, true);
    document.removeEventListener("wheel", onWheel, true);
  };
}

function captureSnapshot(): ScrollLockSnapshot {
  const root = document.documentElement;
  const body = document.body;
  return {
    htmlOverflow: root.style.overflow,
    htmlOverscrollBehavior: root.style.overscrollBehavior,
    bodyOverflow: body.style.overflow,
    bodyOverscrollBehavior: body.style.overscrollBehavior,
    bodyPaddingRight: body.style.paddingRight,
    position: readScrollPosition(),
  };
}

function applyLock(snapshot: ScrollLockSnapshot) {
  const root = document.documentElement;
  const body = document.body;
  const gutter = scrollbarWidth();

  root.style.overflow = "hidden";
  root.style.overscrollBehavior = "none";
  body.style.overflow = "hidden";
  body.style.overscrollBehavior = "none";

  if (gutter > 0) {
    const existing = Number.parseFloat(getComputedStyle(body).paddingRight);
    const base = Number.isFinite(existing) ? existing : 0;
    body.style.paddingRight = `${base + gutter}px`;
  }

  holdScrollPosition(snapshot.position);
}

function restoreSnapshot(snapshot: ScrollLockSnapshot, restoreScroll: boolean) {
  const root = document.documentElement;
  const body = document.body;
  root.style.overflow = snapshot.htmlOverflow;
  root.style.overscrollBehavior = snapshot.htmlOverscrollBehavior;
  body.style.overflow = snapshot.bodyOverflow;
  body.style.overscrollBehavior = snapshot.bodyOverscrollBehavior;
  body.style.paddingRight = snapshot.bodyPaddingRight;
  if (restoreScroll) {
    holdScrollPosition(snapshot.position);
  }
}

export function lockDocumentScroll(
  options: DocumentScrollLockOptions = {}
): () => void {
  const snapshot = captureSnapshot();
  const path = window.location.pathname;
  applyLock(snapshot);
  const releaseGestures = bindBackgroundGestureLock(options.allowScrollWithin);
  let released = false;

  return () => {
    if (released) {
      return;
    }
    released = true;
    releaseGestures();
    // A client navigation unmounts the menu after the next page has taken
    // over the same document. Restoring the previous page's scroll there
    // would jump the destination.
    restoreSnapshot(snapshot, window.location.pathname === path);
  };
}
