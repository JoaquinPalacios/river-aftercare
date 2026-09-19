import {
  NAVIGATION_PROGRESS_COMPLETE_MS,
  NAVIGATION_PROGRESS_FADE_MS,
  NAVIGATION_PROGRESS_MIN_VISIBLE_MS,
  NAVIGATION_PROGRESS_REDUCED_VALUE,
  NAVIGATION_PROGRESS_SHOW_DELAY_MS,
  NAVIGATION_PROGRESS_STEPS,
  NAVIGATION_PROGRESS_STUCK_MS,
} from "@/lib/navigation-progress/timing";

export type NavigationProgressPhase =
  "idle" | "delaying" | "running" | "completing" | "hiding";

export type NavigationProgressSnapshot = {
  phase: NavigationProgressPhase;
  value: number;
  visible: boolean;
  reducedMotion: boolean;
  fromHref: string | null;
  toHref: string | null;
};

export type NavigationProgressListener = (
  snapshot: NavigationProgressSnapshot
) => void;

type TimerHandle = number;

export type NavigationProgressTimers = {
  setTimeout: (callback: () => void, ms: number) => TimerHandle;
  clearTimeout: (handle: TimerHandle) => void;
};

const idleSnapshot: NavigationProgressSnapshot = {
  phase: "idle",
  value: 0,
  visible: false,
  reducedMotion: false,
  fromHref: null,
  toHref: null,
};

export class NavigationProgressMachine {
  private snapshot: NavigationProgressSnapshot = { ...idleSnapshot };
  private readonly listeners = new Set<NavigationProgressListener>();
  private readonly timers: NavigationProgressTimers;
  private readonly pending = new Set<TimerHandle>();
  private visibleAt: number | null = null;
  private now: () => number;

  constructor(
    timers: NavigationProgressTimers = {
      setTimeout: (callback, ms) =>
        globalThis.setTimeout(callback, ms) as unknown as TimerHandle,
      clearTimeout: (handle) => globalThis.clearTimeout(handle),
    },
    now: () => number = () => Date.now()
  ) {
    this.timers = timers;
    this.now = now;
  }

  subscribe(listener: NavigationProgressListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): NavigationProgressSnapshot {
    return this.snapshot;
  }

  setReducedMotion(reducedMotion: boolean): void {
    if (this.snapshot.reducedMotion === reducedMotion) {
      return;
    }

    this.patch({ reducedMotion });
  }

  start(fromHref: string, toHref: string): void {
    if (
      this.snapshot.phase !== "idle" &&
      this.snapshot.phase !== "hiding" &&
      this.snapshot.toHref === toHref
    ) {
      return;
    }

    const alreadyVisible =
      this.snapshot.visible &&
      (this.snapshot.phase === "running" ||
        this.snapshot.phase === "completing" ||
        this.snapshot.phase === "hiding");

    this.clearTimers();

    if (alreadyVisible) {
      this.visibleAt = this.now();
      this.patch({
        phase: "running",
        visible: true,
        value: this.snapshot.reducedMotion
          ? NAVIGATION_PROGRESS_REDUCED_VALUE
          : NAVIGATION_PROGRESS_STEPS[0].value,
        fromHref,
        toHref,
      });
      this.scheduleRunning();
      this.scheduleStuckReset();
      return;
    }

    this.visibleAt = null;
    this.patch({
      phase: "delaying",
      visible: false,
      value: 0,
      fromHref,
      toHref,
    });
    this.schedule(
      () => this.becomeVisible(),
      NAVIGATION_PROGRESS_SHOW_DELAY_MS
    );
    this.scheduleStuckReset();
  }

  complete(): void {
    if (this.snapshot.phase === "idle" || this.snapshot.phase === "hiding") {
      return;
    }

    if (this.snapshot.phase === "delaying" || !this.snapshot.visible) {
      this.reset();
      return;
    }

    this.clearTimers();
    this.patch({
      phase: "completing",
      visible: true,
      value: 1,
    });

    const visibleFor = this.visibleAt ? this.now() - this.visibleAt : 0;
    const remainVisible = Math.max(
      0,
      NAVIGATION_PROGRESS_MIN_VISIBLE_MS - visibleFor
    );
    const completeWait = this.snapshot.reducedMotion
      ? 0
      : NAVIGATION_PROGRESS_COMPLETE_MS;
    this.schedule(() => this.hide(), Math.max(remainVisible, completeWait));
  }

  reset(): void {
    this.clearTimers();
    this.visibleAt = null;
    this.patch({ ...idleSnapshot, reducedMotion: this.snapshot.reducedMotion });
  }

  private scheduleStuckReset(): void {
    this.schedule(() => {
      if (
        this.snapshot.phase === "delaying" ||
        this.snapshot.phase === "running"
      ) {
        this.reset();
      }
    }, NAVIGATION_PROGRESS_STUCK_MS);
  }

  private becomeVisible(): void {
    if (this.snapshot.phase !== "delaying") {
      return;
    }

    this.visibleAt = this.now();
    this.patch({
      phase: "running",
      visible: true,
      value: this.snapshot.reducedMotion
        ? NAVIGATION_PROGRESS_REDUCED_VALUE
        : NAVIGATION_PROGRESS_STEPS[0].value,
    });
    this.scheduleRunning();
  }

  private scheduleRunning(): void {
    if (this.snapshot.reducedMotion) {
      return;
    }

    for (const step of NAVIGATION_PROGRESS_STEPS.slice(1)) {
      this.schedule(() => {
        if (this.snapshot.phase !== "running") {
          return;
        }
        this.patch({ value: step.value });
      }, step.at);
    }
  }

  private hide(): void {
    this.clearTimers();
    this.patch({
      phase: "hiding",
      visible: false,
      value: 1,
    });
    const fade = this.snapshot.reducedMotion ? 80 : NAVIGATION_PROGRESS_FADE_MS;
    this.schedule(() => this.reset(), fade);
  }

  private schedule(callback: () => void, ms: number): void {
    const handle = this.timers.setTimeout(() => {
      this.pending.delete(handle);
      callback();
    }, ms);
    this.pending.add(handle);
  }

  private clearTimers(): void {
    for (const handle of this.pending) {
      this.timers.clearTimeout(handle);
    }
    this.pending.clear();
  }

  private patch(partial: Partial<NavigationProgressSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }
}
