/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";

import { lockDocumentScroll } from "@/lib/marketing/document-scroll-lock";

function clearDocumentStyles() {
  document.documentElement.style.overflow = "";
  document.documentElement.style.overscrollBehavior = "";
  document.documentElement.style.scrollBehavior = "";
  document.body.style.overflow = "";
  document.body.style.overscrollBehavior = "";
  document.body.style.paddingRight = "";
}

function setBoxMetrics(
  element: HTMLElement,
  metrics: { scrollHeight: number; clientHeight: number; scrollTop: number }
) {
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    value: metrics.scrollHeight,
  });
  Object.defineProperty(element, "clientHeight", {
    configurable: true,
    value: metrics.clientHeight,
  });
  Object.defineProperty(element, "scrollTop", {
    configurable: true,
    writable: true,
    value: metrics.scrollTop,
  });
}

function wheel(target: EventTarget, deltaY: number) {
  const event = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY,
  });
  target.dispatchEvent(event);
  return event;
}

function touchMove(target: EventTarget, clientY: number) {
  const event = new Event("touchmove", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    configurable: true,
    value: [{ clientY }],
  });
  target.dispatchEvent(event);
  return event;
}

describe("lockDocumentScroll", () => {
  const restorers: Array<() => void> = [];

  afterEach(() => {
    for (const restore of restorers.splice(0)) {
      restore();
    }
    clearDocumentStyles();
    vi.restoreAllMocks();
  });

  it("does nothing to document scrolling until locked", () => {
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.body.style.overflow).toBe("");
  });

  it("locks document scrolling and restores the previous inline styles", () => {
    document.documentElement.style.overflow = "clip";
    document.documentElement.style.overscrollBehavior = "contain";
    document.body.style.overflow = "scroll";
    document.body.style.overscrollBehavior = "contain";
    document.body.style.paddingRight = "4px";

    const unlock = lockDocumentScroll();
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overscrollBehavior).toBe("none");
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.style.overscrollBehavior).toBe("none");

    unlock();
    expect(document.documentElement.style.overflow).toBe("clip");
    expect(document.documentElement.style.overscrollBehavior).toBe("contain");
    expect(document.body.style.overflow).toBe("scroll");
    expect(document.body.style.overscrollBehavior).toBe("contain");
    expect(document.body.style.paddingRight).toBe("4px");
    expect(document.documentElement.style.scrollBehavior).toBe("");
  });

  it("can lock and unlock repeatedly without leaving stale styles", () => {
    const first = lockDocumentScroll();
    expect(document.body.style.overflow).toBe("hidden");
    first();
    expect(document.body.style.overflow).toBe("");

    const second = lockDocumentScroll();
    expect(document.documentElement.style.overflow).toBe("hidden");
    second();
    second();
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.body.style.overflow).toBe("");
    expect(document.body.style.overscrollBehavior).toBe("");
  });

  it("reserves the scrollbar gap while locked and restores the previous padding", () => {
    const clientWidth = document.documentElement.clientWidth;
    const innerWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: clientWidth + 15,
    });
    restorers.push(() => {
      if (innerWidth) {
        Object.defineProperty(window, "innerWidth", innerWidth);
      } else {
        delete (window as { innerWidth?: number }).innerWidth;
      }
    });
    document.body.style.paddingRight = "4px";

    const unlock = lockDocumentScroll();
    expect(document.body.style.paddingRight).toBe("19px");
    unlock();
    expect(document.body.style.paddingRight).toBe("4px");
  });

  it("writes the scroll position back only when the browser moved it", () => {
    let y = 480;
    const scrollY = Object.getOwnPropertyDescriptor(window, "scrollY");
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      get: () => y,
    });
    restorers.push(() => {
      if (scrollY) {
        Object.defineProperty(window, "scrollY", scrollY);
      }
    });
    const scrollTo = vi
      .spyOn(window, "scrollTo")
      .mockImplementation((options) => {
        if (
          options &&
          typeof options === "object" &&
          "top" in options &&
          typeof options.top === "number"
        ) {
          y = options.top;
        }
      });
    document.documentElement.style.scrollBehavior = "smooth";

    const unlock = lockDocumentScroll();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(document.documentElement.style.scrollBehavior).toBe("smooth");

    y = 0;
    unlock();
    expect(scrollTo).toHaveBeenCalledWith({
      top: 480,
      left: 0,
      behavior: "instant",
    });
    expect(y).toBe(480);
    expect(document.documentElement.style.scrollBehavior).toBe("smooth");
  });

  it("does not restore the previous page scroll after navigation", () => {
    let y = 640;
    const scrollY = Object.getOwnPropertyDescriptor(window, "scrollY");
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      get: () => y,
    });
    restorers.push(() => {
      if (scrollY) {
        Object.defineProperty(window, "scrollY", scrollY);
      }
      window.history.pushState({}, "", "/");
    });
    const scrollTo = vi
      .spyOn(window, "scrollTo")
      .mockImplementation((options) => {
        if (
          options &&
          typeof options === "object" &&
          "top" in options &&
          typeof options.top === "number"
        ) {
          y = options.top;
        }
      });

    const unlock = lockDocumentScroll();
    window.history.pushState({}, "", "/pricing");
    y = 0;
    unlock();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(y).toBe(0);
    expect(document.body.style.overflow).toBe("");
  });

  it("blocks background wheel and touch scrolling and lets the menu panel scroll", () => {
    const menu = document.createElement("div");
    document.body.appendChild(menu);
    restorers.push(() => menu.remove());
    setBoxMetrics(menu, {
      scrollHeight: 800,
      clientHeight: 200,
      scrollTop: 40,
    });

    const unlock = lockDocumentScroll({ allowScrollWithin: menu });

    const backgroundWheel = wheel(document, 30);
    expect(backgroundWheel.defaultPrevented).toBe(true);

    const menuWheel = wheel(menu, 24);
    expect(menuWheel.defaultPrevented).toBe(false);

    menu.scrollTop = 0;
    const atTop = wheel(menu, -12);
    expect(atTop.defaultPrevented).toBe(true);

    const backgroundTouch = touchMove(document.body, 20);
    expect(backgroundTouch.defaultPrevented).toBe(true);

    menu.scrollTop = 40;
    document.dispatchEvent(
      Object.assign(new Event("touchstart", { bubbles: true }), {
        touches: [{ clientY: 120 }],
      })
    );
    const menuTouch = touchMove(menu, 80);
    expect(menuTouch.defaultPrevented).toBe(false);

    unlock();
    const after = wheel(document, 30);
    expect(after.defaultPrevented).toBe(false);
  });
});
