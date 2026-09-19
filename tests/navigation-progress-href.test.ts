/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import {
  appNavigationFromClick,
  isHashOnlyNavigation,
  isQueryOnlyNavigation,
  isTrackedAppNavigation,
} from "@/lib/navigation-progress/href";

function url(href: string): URL {
  return new URL(href);
}

function clickEvent(
  anchor: HTMLAnchorElement,
  extra: MouseEventInit = {}
): MouseEvent {
  const event = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...extra,
  });
  Object.defineProperty(event, "target", { value: anchor });
  return event;
}

describe("navigation progress href classification", () => {
  it("tracks same-origin path changes and ignores hash, query, and foreign URLs", () => {
    const home = url("http://localhost:3000/");
    const about = url("http://localhost:3000/about");
    const aboutHash = url("http://localhost:3000/about#team");
    const pricingQuery = url("http://localhost:3000/about?ref=nav");
    const staff = url("http://app.localhost:3000/login");
    const mail = url("mailto:hello@example.test");

    expect(isTrackedAppNavigation(home, about)).toBe(true);
    expect(isTrackedAppNavigation(about, home)).toBe(true);
    expect(isTrackedAppNavigation(about, aboutHash)).toBe(false);
    expect(isHashOnlyNavigation(about, aboutHash)).toBe(true);
    expect(isQueryOnlyNavigation(about, pricingQuery)).toBe(true);
    expect(isTrackedAppNavigation(about, pricingQuery)).toBe(false);
    expect(isTrackedAppNavigation(home, staff)).toBe(false);
    expect(isTrackedAppNavigation(home, mail)).toBe(false);
    expect(isTrackedAppNavigation(home, home)).toBe(false);
  });

  it("ignores modified clicks, downloads, new tabs, and non-http schemes", () => {
    const from = "http://localhost:3000/";
    const internal = document.createElement("a");
    internal.href = "http://localhost:3000/pricing";
    internal.append("Pricing");
    document.body.append(internal);

    expect(
      appNavigationFromClick(clickEvent(internal), from)?.to.pathname
    ).toBe("/pricing");
    expect(
      appNavigationFromClick(clickEvent(internal, { metaKey: true }), from)
    ).toBeNull();
    expect(
      appNavigationFromClick(clickEvent(internal, { button: 1 }), from)
    ).toBeNull();

    internal.setAttribute("download", "");
    expect(appNavigationFromClick(clickEvent(internal), from)).toBeNull();
    internal.removeAttribute("download");
    internal.target = "_blank";
    expect(appNavigationFromClick(clickEvent(internal), from)).toBeNull();

    const mail = document.createElement("a");
    mail.href = "mailto:hello@example.test";
    mail.append("Email");
    document.body.append(mail);
    expect(appNavigationFromClick(clickEvent(mail), from)).toBeNull();

    const hash = document.createElement("a");
    hash.href = "http://localhost:3000/#workflow";
    hash.append("Workflow");
    document.body.append(hash);
    expect(appNavigationFromClick(clickEvent(hash), from)).toBeNull();

    const same = document.createElement("a");
    same.href = "http://localhost:3000/";
    same.append("Home");
    document.body.append(same);
    expect(appNavigationFromClick(clickEvent(same), from)).toBeNull();

    const external = document.createElement("a");
    external.href = "http://app.localhost:3000/login";
    external.append("Sign in");
    document.body.append(external);
    expect(appNavigationFromClick(clickEvent(external), from)).toBeNull();

    internal.remove();
    mail.remove();
    hash.remove();
    same.remove();
    external.remove();
  });
});
