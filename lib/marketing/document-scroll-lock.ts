/**
 * Locks scrolling on the marketing document while the mobile menu is open.
 *
 * The public header is sticky. Setting `overflow: hidden` on the document
 * breaks that stickiness and jumps the page, so the lock pins the body with
 * `position: fixed` at the current scroll offset instead. The header is
 * pinned to the viewport for the same moment so it stays where the menu
 * opened it. Padding replaces the header's in-flow space and any classic
 * scrollbar gap, which keeps the page from shifting.
 *
 * Background touch and wheel gestures are cancelled so iOS Safari cannot
 * rubber-band the page. The menu panel can still scroll internally.
 *
 * Inline styles written here are restored to the values they had before the
 * lock. On the same page, scroll position is written back instantly so
 * `scroll-behavior: smooth` on `html` cannot animate a jump. A client
 * navigation does not reuse the previous page's scroll offset.
 */

type ScrollPosition = {
  x: number;
  y: number;
};

type HeaderSnapshot = {
  element: HTMLElement;
  position: string;
  top: string;
  left: string;
  right: string;
  width: string;
};

type ScrollLockSnapshot = {
  htmlOverscrollBehavior: string;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyRight: string;
  bodyWidth: string;
  bodyOverflow: string;
  bodyOverscrollBehavior: string;
  bodyPaddingTop: string;
  bodyPaddingRight: string;
  header: HeaderSnapshot | null;
  position: ScrollPosition;
};

export type DocumentScrollLockOptions = {
  /** Panel that may scroll internally while the document is locked. */
  allowScrollWithin?: HTMLElement | null;
  /** Sticky header to keep fixed to the viewport while the body is pinned. */
  pinHeader?: HTMLElement | null;
};

function readScrollPosition(): ScrollPosition {
  return {
    x: window.scrollX,
    y: window.scrollY,
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

function captureHeader(
  header: HTMLElement | null | undefined
): HeaderSnapshot | null {
  if (!header) {
    return null;
  }
  return {
    element: header,
    position: header.style.position,
    top: header.style.top,
    left: header.style.left,
    right: header.style.right,
    width: header.style.width,
  };
}

function captureSnapshot(
  pinHeader: HTMLElement | null | undefined
): ScrollLockSnapshot {
  const root = document.documentElement;
  const body = document.body;
  return {
    htmlOverscrollBehavior: root.style.overscrollBehavior,
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyLeft: body.style.left,
    bodyRight: body.style.right,
    bodyWidth: body.style.width,
    bodyOverflow: body.style.overflow,
    bodyOverscrollBehavior: body.style.overscrollBehavior,
    bodyPaddingTop: body.style.paddingTop,
    bodyPaddingRight: body.style.paddingRight,
    header: captureHeader(pinHeader),
    position: readScrollPosition(),
  };
}

function applyLock(snapshot: ScrollLockSnapshot) {
  const root = document.documentElement;
  const body = document.body;
  const gutter = scrollbarWidth();
  const header = snapshot.header?.element ?? null;
  const headerHeight = header?.offsetHeight ?? 0;

  root.style.overscrollBehavior = "none";
  body.style.position = "fixed";
  body.style.top = `-${snapshot.position.y}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "auto";
  body.style.overflow = "hidden";
  body.style.overscrollBehavior = "none";

  if (header && headerHeight > 0) {
    const existingTop = Number.parseFloat(getComputedStyle(body).paddingTop);
    const baseTop = Number.isFinite(existingTop) ? existingTop : 0;
    body.style.paddingTop = `${baseTop + headerHeight}px`;
    header.style.position = "fixed";
    header.style.top = "0px";
    header.style.left = "0";
    header.style.right = gutter > 0 ? `${gutter}px` : "0";
    header.style.width = "auto";
  }

  if (gutter > 0) {
    const existingRight = Number.parseFloat(
      getComputedStyle(body).paddingRight
    );
    const baseRight = Number.isFinite(existingRight) ? existingRight : 0;
    body.style.paddingRight = `${baseRight + gutter}px`;
  }
}

function restoreSnapshot(snapshot: ScrollLockSnapshot, restoreScroll: boolean) {
  const root = document.documentElement;
  const body = document.body;
  root.style.overscrollBehavior = snapshot.htmlOverscrollBehavior;
  body.style.position = snapshot.bodyPosition;
  body.style.top = snapshot.bodyTop;
  body.style.left = snapshot.bodyLeft;
  body.style.right = snapshot.bodyRight;
  body.style.width = snapshot.bodyWidth;
  body.style.overflow = snapshot.bodyOverflow;
  body.style.overscrollBehavior = snapshot.bodyOverscrollBehavior;
  body.style.paddingTop = snapshot.bodyPaddingTop;
  body.style.paddingRight = snapshot.bodyPaddingRight;

  const header = snapshot.header;
  if (header) {
    header.element.style.position = header.position;
    header.element.style.top = header.top;
    header.element.style.left = header.left;
    header.element.style.right = header.right;
    header.element.style.width = header.width;
  }

  if (restoreScroll) {
    holdScrollPosition(snapshot.position);
  }
}

export function lockDocumentScroll(
  options: DocumentScrollLockOptions = {}
): () => void {
  const snapshot = captureSnapshot(options.pinHeader);
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
