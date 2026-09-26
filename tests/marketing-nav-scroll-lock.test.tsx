/** @vitest-environment jsdom */

import { act, type AnchorHTMLAttributes, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { MarketingNavMenu } from "@/app/(marketing)/components/marketing-nav-menu";

const openMenus = new WeakSet<Element>();
const originalMatches = Element.prototype.matches;

function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    get matches() {
      return matches;
    },
    media: "(max-width: 47.99rem)",
    onchange: null,
    addListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    addEventListener: (
      _type: string,
      listener: (event: MediaQueryListEvent) => void
    ) => {
      listeners.add(listener);
    },
    removeEventListener: (
      _type: string,
      listener: (event: MediaQueryListEvent) => void
    ) => {
      listeners.delete(listener);
    },
    dispatchEvent: () => false,
  };

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => media,
  });

  return {
    setMatches(next: boolean) {
      matches = next;
      for (const listener of listeners) {
        listener({ matches: next } as MediaQueryListEvent);
      }
    },
  };
}

function renderMenu() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onOpenChange = vi.fn();
  act(() => {
    root.render(
      <MarketingNavMenu
        staffHref="http://app.localhost:3000/login"
        onOpenChange={onOpenChange}
        items={[
          { href: "/about", label: "About" },
          { href: "/pricing", label: "Pricing" },
        ]}
        clinicItems={[{ href: "/clinics", label: "Overview" }]}
      />
    );
  });
  const menu = container.querySelector("[popover]") as HTMLDivElement;
  const trigger = container.querySelector("button") as HTMLButtonElement;
  menu.hidePopover = () => {
    openMenus.delete(menu);
    menu.dispatchEvent(new Event("toggle"));
  };
  return { container, root, menu, trigger, onOpenChange };
}

describe("marketing mobile navigation scroll lock", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;
  let media: ReturnType<typeof installMatchMedia> | undefined;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Element.prototype.matches = function matches(selector: string) {
      if (selector === ":popover-open") {
        return openMenus.has(this);
      }
      return originalMatches.call(this, selector);
    };
    media = installMatchMedia(true);
    document.documentElement.style.overflow = "clip";
    document.body.style.overflow = "";
    document.body.style.paddingRight = "3px";
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = undefined;
    container = undefined;
    Element.prototype.matches = originalMatches;
    document.documentElement.style.overflow = "";
    document.documentElement.style.overscrollBehavior = "";
    document.body.style.overflow = "";
    document.body.style.overscrollBehavior = "";
    document.body.style.paddingRight = "";
  });

  function openMenu(menu: HTMLElement) {
    act(() => {
      openMenus.add(menu);
      menu.dispatchEvent(new Event("toggle"));
    });
  }

  function closeMenu(menu: HTMLElement) {
    act(() => {
      openMenus.delete(menu);
      menu.dispatchEvent(new Event("toggle"));
    });
  }

  it("keeps document scrolling unlocked while the menu is closed", () => {
    ({ root, container } = renderMenu());
    expect(document.documentElement.style.overflow).toBe("clip");
    expect(document.body.style.overflow).toBe("");
  });

  it("locks scrolling when the menu opens and restores it when the menu closes", () => {
    const rendered = renderMenu();
    root = rendered.root;
    container = rendered.container;

    openMenu(rendered.menu);
    expect(rendered.trigger.getAttribute("aria-expanded")).toBe("true");
    expect(rendered.onOpenChange).toHaveBeenCalledWith(true);
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");

    closeMenu(rendered.menu);
    expect(rendered.trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.documentElement.style.overflow).toBe("clip");
    expect(document.body.style.overflow).toBe("");
    expect(document.body.style.paddingRight).toBe("3px");
    expect(document.documentElement.style.overscrollBehavior).toBe("");
  });

  it("restores scrolling when the menu unmounts while open", () => {
    const rendered = renderMenu();
    root = rendered.root;
    container = rendered.container;
    openMenu(rendered.menu);
    expect(document.body.style.overflow).toBe("hidden");

    act(() => {
      root?.unmount();
    });
    root = undefined;
    expect(document.documentElement.style.overflow).toBe("clip");
    expect(document.body.style.overflow).toBe("");
    expect(document.body.style.paddingRight).toBe("3px");
  });

  it("restores scrolling when Escape closes the menu", () => {
    const rendered = renderMenu();
    root = rendered.root;
    container = rendered.container;
    openMenu(rendered.menu);
    expect(document.body.style.overflow).toBe("hidden");

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(rendered.trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.documentElement.style.overflow).toBe("clip");
    expect(document.body.style.overflow).toBe("");
  });

  it("does not lock scrolling on the desktop marketing navigation", () => {
    media?.setMatches(false);
    const rendered = renderMenu();
    root = rendered.root;
    container = rendered.container;
    openMenu(rendered.menu);
    expect(document.documentElement.style.overflow).toBe("clip");
    expect(document.body.style.overflow).toBe("");
  });

  it("releases the lock when the viewport leaves the mobile menu breakpoint", () => {
    const rendered = renderMenu();
    root = rendered.root;
    container = rendered.container;
    openMenu(rendered.menu);
    expect(document.body.style.overflow).toBe("hidden");

    act(() => {
      media?.setMatches(false);
    });

    expect(rendered.trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.documentElement.style.overflow).toBe("clip");
    expect(document.body.style.overflow).toBe("");
    expect(document.body.style.paddingRight).toBe("3px");
  });
});
