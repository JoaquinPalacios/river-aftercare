/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

import {
  getNavigationProgressSnapshot,
  installNavigationProgressInstrumentation,
  resetNavigationProgressForTests,
} from "@/lib/navigation-progress";

describe("navigation progress instrumentation", () => {
  afterEach(() => {
    resetNavigationProgressForTests();
    window.history.replaceState({}, "", "/");
  });

  it("observes clicks without preventDefault or custom routing", () => {
    const source = readFileSync(
      "lib/navigation-progress/controller.ts",
      "utf8"
    );
    expect(source).not.toMatch(/event\.preventDefault\(/);
    expect(source).not.toContain("router.push");
    expect(source).not.toContain("router.replace");
    expect(source).toMatch(
      /const result = original\([\s\S]*?machine\.start\([\s\S]*?return result/
    );

    window.history.replaceState({}, "", "/");
    const uninstall = installNavigationProgressInstrumentation();
    const link = document.createElement("a");
    link.href = "/about";
    link.textContent = "About";
    document.body.append(link);

    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    link.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(getNavigationProgressSnapshot().phase).toBe("delaying");
    expect(getNavigationProgressSnapshot().visible).toBe(false);

    link.remove();
    uninstall();
  });

  it("invokes the original history method before progress observation", () => {
    const calls: string[] = [];
    const realPush = window.history.pushState.bind(window.history);
    window.history.pushState = ((
      data: unknown,
      unused: string,
      url?: string | URL | null
    ) => {
      calls.push("original");
      return realPush(data, unused, url);
    }) as History["pushState"];

    const uninstall = installNavigationProgressInstrumentation();
    window.history.pushState({}, "", "/pricing");

    expect(calls).toEqual(["original"]);
    expect(window.location.pathname).toBe("/pricing");
    expect(getNavigationProgressSnapshot().phase).toBe("delaying");
    expect(getNavigationProgressSnapshot().visible).toBe(false);

    uninstall();
  });
});
