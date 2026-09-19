import { afterEach, describe, expect, it, vi } from "vitest";

import { NavigationProgressMachine } from "@/lib/navigation-progress/machine";
import {
  NAVIGATION_PROGRESS_FADE_MS,
  NAVIGATION_PROGRESS_MIN_VISIBLE_MS,
  NAVIGATION_PROGRESS_SHOW_DELAY_MS,
} from "@/lib/navigation-progress/timing";

describe("navigation progress machine", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function createMachine() {
    vi.useFakeTimers();
    return new NavigationProgressMachine();
  }

  it("does not become visible when navigation completes before the show delay", () => {
    const machine = createMachine();
    const seen: string[] = [];
    machine.subscribe((snapshot) =>
      seen.push(`${snapshot.phase}:${snapshot.visible}`)
    );

    machine.start("http://localhost:3000/", "http://localhost:3000/about");
    expect(machine.getSnapshot()).toMatchObject({
      phase: "delaying",
      visible: false,
      value: 0,
    });

    vi.advanceTimersByTime(NAVIGATION_PROGRESS_SHOW_DELAY_MS - 10);
    machine.complete();

    expect(machine.getSnapshot()).toMatchObject({
      phase: "idle",
      visible: false,
      value: 0,
    });
    expect(seen.some((entry) => entry.startsWith("running:true"))).toBe(false);
  });

  it("shows after the delay, holds a minimum visible time, then fades out", () => {
    const machine = createMachine();
    machine.start("http://localhost:3000/", "http://localhost:3000/about");
    vi.advanceTimersByTime(NAVIGATION_PROGRESS_SHOW_DELAY_MS);

    expect(machine.getSnapshot()).toMatchObject({
      phase: "running",
      visible: true,
      value: 0.1,
    });

    machine.complete();
    expect(machine.getSnapshot()).toMatchObject({
      phase: "completing",
      visible: true,
      value: 1,
    });

    vi.advanceTimersByTime(NAVIGATION_PROGRESS_MIN_VISIBLE_MS - 10);
    expect(machine.getSnapshot().phase).toBe("completing");

    vi.advanceTimersByTime(10);
    expect(machine.getSnapshot()).toMatchObject({
      phase: "hiding",
      visible: false,
      value: 1,
    });

    vi.advanceTimersByTime(NAVIGATION_PROGRESS_FADE_MS);
    expect(machine.getSnapshot().phase).toBe("idle");
    expect(machine.getSnapshot().visible).toBe(false);
  });

  it("does not restart an in-flight navigation to the same destination", () => {
    const machine = createMachine();
    machine.start("http://localhost:3000/", "http://localhost:3000/about");
    vi.advanceTimersByTime(NAVIGATION_PROGRESS_SHOW_DELAY_MS);
    machine.start("http://localhost:3000/", "http://localhost:3000/about");

    expect(machine.getSnapshot().value).toBe(0.1);
    vi.advanceTimersByTime(180);
    expect(machine.getSnapshot().value).toBe(0.35);
  });

  it("uses a static reduced-motion bar instead of stepped motion", () => {
    const machine = createMachine();
    machine.setReducedMotion(true);
    machine.start("http://localhost:3000/", "http://localhost:3000/about");
    vi.advanceTimersByTime(NAVIGATION_PROGRESS_SHOW_DELAY_MS);

    expect(machine.getSnapshot()).toMatchObject({
      reducedMotion: true,
      visible: true,
      value: 0.4,
    });

    vi.advanceTimersByTime(900);
    expect(machine.getSnapshot().value).toBe(0.4);

    machine.complete();
    expect(machine.getSnapshot().value).toBe(1);
  });

  it("clears stuck navigations without remaining visible", () => {
    const machine = createMachine();
    machine.start("http://localhost:3000/", "http://localhost:3000/about");
    vi.advanceTimersByTime(NAVIGATION_PROGRESS_SHOW_DELAY_MS);
    expect(machine.getSnapshot().visible).toBe(true);

    vi.advanceTimersByTime(15_000);
    expect(machine.getSnapshot()).toMatchObject({
      phase: "idle",
      visible: false,
    });
  });
});
