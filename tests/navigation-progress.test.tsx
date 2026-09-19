/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pathnameState = vi.hoisted(() => ({ value: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameState.value,
}));

import { NavigationProgress } from "@/app/components/navigation-progress";
import {
  completeAppNavigation,
  resetNavigationProgressForTests,
  startAppNavigation,
} from "@/lib/navigation-progress";
import {
  NAVIGATION_PROGRESS_COMPLETE_MS,
  NAVIGATION_PROGRESS_FADE_MS,
  NAVIGATION_PROGRESS_SHOW_DELAY_MS,
} from "@/lib/navigation-progress/timing";

describe("NavigationProgress", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    pathnameState.value = "/";
    window.history.replaceState({}, "", "/");
    resetNavigationProgressForTests();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    resetNavigationProgressForTests();
    vi.useRealTimers();
  });

  async function renderBar() {
    await act(async () => {
      root.render(<NavigationProgress />);
    });
  }

  function bar() {
    return container.querySelector("[data-navigation-progress]") as HTMLElement;
  }

  function click(element: HTMLElement) {
    element.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
      },
      { once: true }
    );
    element.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })
    );
  }

  it("renders a single aria-hidden overlay that is idle until a route starts", async () => {
    await renderBar();
    expect(bar()).not.toBeNull();
    expect(bar().getAttribute("aria-hidden")).toBe("true");
    expect(bar().getAttribute("data-phase")).toBe("idle");
    expect(bar().getAttribute("data-visible")).toBe("false");
    expect(
      document.querySelectorAll("[data-navigation-progress]")
    ).toHaveLength(1);
  });

  it("starts from an internal link click and completes when the path commits", async () => {
    vi.useFakeTimers();
    await renderBar();

    const link = document.createElement("a");
    link.href = "/about";
    link.textContent = "About";
    document.body.append(link);

    act(() => {
      click(link);
    });

    expect(bar().getAttribute("data-phase")).toBe("delaying");
    expect(bar().getAttribute("data-visible")).toBe("false");

    act(() => {
      vi.advanceTimersByTime(NAVIGATION_PROGRESS_SHOW_DELAY_MS);
    });
    expect(bar().getAttribute("data-visible")).toBe("true");
    expect(bar().getAttribute("data-phase")).toBe("running");

    pathnameState.value = "/about";
    await act(async () => {
      root.render(<NavigationProgress />);
    });

    expect(bar().getAttribute("data-phase")).toBe("completing");
    expect(bar().getAttribute("data-visible")).toBe("true");

    act(() => {
      vi.advanceTimersByTime(NAVIGATION_PROGRESS_COMPLETE_MS);
    });
    expect(bar().getAttribute("data-phase")).toBe("hiding");
    expect(bar().getAttribute("data-visible")).toBe("false");

    act(() => {
      vi.advanceTimersByTime(NAVIGATION_PROGRESS_FADE_MS);
    });
    expect(bar().getAttribute("data-phase")).toBe("idle");
    link.remove();
  });

  it("does not start for same-route, hash, or external links", async () => {
    await renderBar();

    const same = document.createElement("a");
    same.href = "/";
    same.textContent = "Home";
    const hash = document.createElement("a");
    hash.href = "/#workflow";
    hash.textContent = "Workflow";
    const external = document.createElement("a");
    external.href = "https://example.test/login";
    external.textContent = "External";
    document.body.append(same, hash, external);

    act(() => {
      click(same);
      click(hash);
      click(external);
    });

    expect(bar().getAttribute("data-phase")).toBe("idle");
    same.remove();
    hash.remove();
    external.remove();
  });

  it("does not start when theme switching leaves the current route", async () => {
    await renderBar();
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Dark";
    document.body.append(button);

    act(() => {
      click(button);
      document.documentElement.setAttribute("data-theme-mode", "dark");
    });

    expect(bar().getAttribute("data-phase")).toBe("idle");
    button.remove();
  });

  it("cleans up instrumentation so a second mount does not leave a stuck bar", async () => {
    vi.useFakeTimers();
    await renderBar();
    startAppNavigation("/about");
    act(() => {
      vi.advanceTimersByTime(NAVIGATION_PROGRESS_SHOW_DELAY_MS);
    });
    expect(bar().getAttribute("data-visible")).toBe("true");

    await act(async () => {
      root.unmount();
    });
    completeAppNavigation();
    resetNavigationProgressForTests();

    root = createRoot(container);
    await renderBar();
    expect(bar().getAttribute("data-phase")).toBe("idle");
    expect(bar().getAttribute("data-visible")).toBe("false");
  });
});
