import { describe, expect, it } from "vitest";

import { shareMenuPanelPosition } from "@/lib/staff/share-menu-frame";

describe("shareMenuPanelPosition", () => {
  it("opens below a button that has room in the viewport", () => {
    const frame = shareMenuPanelPosition({
      viewportWidth: 1440,
      viewportHeight: 900,
      buttonTop: 420,
      buttonRight: 1180,
      buttonBottom: 452,
      panelWidth: 280,
      panelHeight: 198,
    });

    expect(frame.top).toBe(458);
    expect(frame.left).toBe(900);
    expect(frame.width).toBe(280);
  });

  it("opens above a button that sits at the bottom of a phone viewport", () => {
    const frame = shareMenuPanelPosition({
      viewportWidth: 390,
      viewportHeight: 844,
      buttonTop: 800,
      buttonRight: 360,
      buttonBottom: 832,
      panelWidth: 0,
      panelHeight: 199,
    });

    expect(frame.top).toBe(595);
    expect(frame.top + 199).toBeLessThan(800);
    expect(frame.left).toBe(88);
    expect(frame.width).toBe(272);
    expect(frame.left + frame.width).toBeLessThanOrEqual(390 - 8);
  });

  it("keeps the menu inside a narrow viewport when the button is at the left edge", () => {
    const frame = shareMenuPanelPosition({
      viewportWidth: 390,
      viewportHeight: 844,
      buttonTop: 200,
      buttonRight: 40,
      buttonBottom: 232,
      panelWidth: 300,
      panelHeight: 180,
    });

    expect(frame.left).toBe(8);
    expect(frame.top).toBe(238);
    expect(frame.width).toBe(300);
  });
});
