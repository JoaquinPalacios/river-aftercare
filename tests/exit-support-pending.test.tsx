/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";

import { act, Component, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const support = vi.hoisted(() => {
  const state: {
    calls: number;
    impl: () => Promise<void>;
  } = {
    calls: 0,
    impl: async () => undefined,
  };
  return state;
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/app/(staff)/(operator)/operator/support-actions", () => ({
  stopOperatorClinicSupportAction: () => {
    support.calls += 1;
    return support.impl();
  },
}));

import { PortalChrome } from "@/app/(staff)/components/portal-chrome";

class SupportErrorBoundary extends Component<
  { children: ReactNode },
  { message: string | null }
> {
  state = { message: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { message: error.message };
  }

  render() {
    if (this.state.message) {
      return <p role="alert">{this.state.message}</p>;
    }
    return this.props.children;
  }
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("Exit support pending feedback", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    support.calls = 0;
    support.impl = async () => undefined;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  async function renderBanner() {
    await act(async () => {
      root.render(
        <PortalChrome
          displayName="Riverside Dental Demo"
          userLabel="Op Operator"
          roleLabel="Platform operator"
          patientSiteHref={null}
          canManagePractice
          assistingClinicName="Riverside Dental Demo"
        >
          <p>Clinic content</p>
        </PortalChrome>
      );
    });
  }

  function exitButton(): HTMLButtonElement {
    const button = container.querySelector(".staffOperatorAssistBanner button");
    expect(button).not.toBeNull();
    return button as HTMLButtonElement;
  }

  it("shows Exiting… with the shared spinner, then restores", async () => {
    const pending = deferred();
    support.impl = () => pending.promise;
    await renderBanner();

    const banner = container.querySelector(".staffOperatorAssistBanner");
    expect(banner?.textContent).toContain("Assisting");
    expect(banner?.textContent).toContain("Riverside Dental Demo");
    expect(exitButton().textContent).toBe("Exit support");
    expect(exitButton().disabled).toBe(false);
    expect(exitButton().getAttribute("aria-busy")).toBeNull();
    expect(exitButton().querySelector(".staffBtnSpinner")).toBeNull();

    const form = exitButton().closest("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });

    expect(support.calls).toBe(1);
    expect(exitButton().disabled).toBe(true);
    expect(exitButton().getAttribute("aria-busy")).toBe("true");
    expect(exitButton().textContent).toBe("Exiting…");
    expect(exitButton().querySelector(".staffBtnSpinner")).not.toBeNull();
    expect(
      exitButton()
        .querySelector(".staffBtnSpinner")
        ?.getAttribute("aria-hidden")
    ).toBe("true");
    expect(banner?.textContent).toContain("Assisting");
    expect(banner?.textContent).toContain("Riverside Dental Demo");

    await act(async () => {
      exitButton().click();
    });
    expect(support.calls).toBe(1);

    await act(async () => {
      pending.resolve();
    });
    expect(exitButton().disabled).toBe(false);
    expect(exitButton().textContent).toBe("Exit support");
    expect(exitButton().getAttribute("aria-busy")).toBeNull();
    expect(exitButton().querySelector(".staffBtnSpinner")).toBeNull();
    expect(banner?.textContent).toContain("Assisting");
  });

  it("does not leave Exit support disabled when the action fails", async () => {
    const pending = deferred();
    support.impl = () => pending.promise;
    await act(async () => {
      root.render(
        <SupportErrorBoundary>
          <PortalChrome
            displayName="Riverside Dental Demo"
            userLabel="Op Operator"
            roleLabel="Platform operator"
            patientSiteHref={null}
            canManagePractice
            assistingClinicName="Riverside Dental Demo"
          >
            <p>Clinic content</p>
          </PortalChrome>
        </SupportErrorBoundary>
      );
    });
    const form = exitButton().closest("form") as HTMLFormElement;

    await act(async () => {
      form.requestSubmit();
    });
    expect(exitButton().disabled).toBe(true);
    expect(exitButton().textContent).toBe("Exiting…");

    await act(async () => {
      pending.reject(new Error("support exit failed"));
    });

    expect(support.calls).toBe(1);
    expect(container.querySelector("button:disabled")).toBeNull();
    expect(container.querySelector(".staffBtnSpinner")).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "support exit failed"
    );
  });

  it("keeps the existing support action and clinics redirect", () => {
    const chrome = readFileSync(
      "app/(staff)/components/portal-chrome.tsx",
      "utf8"
    );
    const action = readFileSync(
      "app/(staff)/(operator)/operator/support-actions.ts",
      "utf8"
    );

    expect(chrome).toContain("action={stopOperatorClinicSupportAction}");
    expect(chrome).toContain('label="Exit support"');
    expect(chrome).toContain('pendingLabel="Exiting…"');
    expect(chrome).toContain("PendingSubmitButton");
    expect(action).toContain("clearOperatorSupportClinicCookie");
    expect(action).toContain('redirect("/operator/clinics")');
    expect(action).toContain("requirePlatformOperator");
  });
});
