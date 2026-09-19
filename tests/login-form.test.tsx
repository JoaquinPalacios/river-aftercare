/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.hoisted(() => vi.fn());
const refreshMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
}));

import { LoginForm } from "@/app/(staff)/login/login-form";

function setInputValue(element: HTMLInputElement, value: string) {
  const descriptor =
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value") ??
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("login form pending UX", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    pushMock.mockReset();
    refreshMock.mockReset();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  async function renderForm() {
    await act(async () => {
      root.render(<LoginForm />);
    });
  }

  function form() {
    return container.querySelector("form") as HTMLFormElement;
  }

  function emailInput() {
    return container.querySelector("#email") as HTMLInputElement;
  }

  function passwordInput() {
    return container.querySelector("#password") as HTMLInputElement;
  }

  function visibilityToggle() {
    return container.querySelector(
      'button[aria-label="Show password"], button[aria-label="Hide password"]'
    ) as HTMLButtonElement;
  }

  function submitButton() {
    return container.querySelector(
      'button[type="submit"]'
    ) as HTMLButtonElement;
  }

  async function fillValidCredentials() {
    await act(async () => {
      setInputValue(emailInput(), "admin@care-guide.test");
      setInputValue(passwordInput(), "password");
    });
  }

  async function submitForm() {
    await act(async () => {
      form().dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
  }

  async function flushLoginRequest() {
    await act(async () => {
      const result = fetchMock.mock.results.at(-1)?.value;
      if (result) {
        await result;
      }
      await Promise.resolve();
    });
  }

  function deferredResponse() {
    let resolve!: (value: Response) => void;
    const promise = new Promise<Response>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  }

  it("disables every control, shows a spinner, and exposes pending status", async () => {
    const pending = deferredResponse();
    fetchMock.mockReturnValue(pending.promise);

    await renderForm();
    await fillValidCredentials();
    await submitForm();

    expect(form().getAttribute("aria-busy")).toBe("true");
    expect(emailInput().disabled).toBe(true);
    expect(passwordInput().disabled).toBe(true);
    expect(visibilityToggle().disabled).toBe(true);
    expect(submitButton().disabled).toBe(true);
    expect(submitButton().textContent).toContain("Signing in…");
    expect(container.querySelector(".staffLoginSpinner")).not.toBeNull();
    expect(container.querySelector("#login-pending-status")?.textContent).toBe(
      "Signing in. Please wait."
    );
    expect(emailInput().value).toBe("admin@care-guide.test");
    expect(passwordInput().value).toBe("password");

    await act(async () => {
      pending.resolve(
        new Response(JSON.stringify({ error: "Invalid credentials." }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        })
      );
    });
  });

  it("prevents duplicate submission while authentication is pending", async () => {
    const pending = deferredResponse();
    fetchMock.mockReturnValue(pending.promise);

    await renderForm();
    await fillValidCredentials();
    await submitForm();
    await submitForm();
    submitButton().click();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(
        new Response(JSON.stringify({ error: "Invalid credentials." }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        })
      );
    });
  });

  it("re-enables controls after a generic credential failure and keeps the entered values", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid credentials." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    );

    await renderForm();
    await fillValidCredentials();
    await submitForm();
    await flushLoginRequest();

    expect(emailInput().disabled).toBe(false);
    expect(passwordInput().disabled).toBe(false);
    expect(visibilityToggle().disabled).toBe(false);
    expect(submitButton().disabled).toBe(false);
    expect(submitButton().textContent).toBe("Sign in");
    expect(emailInput().value).toBe("admin@care-guide.test");
    expect(passwordInput().value).toBe("password");
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe("Invalid email or password.");
    expect(form().getAttribute("aria-busy")).toBeNull();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("keeps the form pending after a successful login until navigation is requested", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ redirectTo: "/dashboard" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await renderForm();
    await fillValidCredentials();
    await submitForm();
    await flushLoginRequest();

    expect(pushMock).toHaveBeenCalledWith("/dashboard");
    expect(refreshMock).toHaveBeenCalled();
    expect(emailInput().disabled).toBe(true);
    expect(passwordInput().disabled).toBe(true);
    expect(visibilityToggle().disabled).toBe(true);
    expect(submitButton().disabled).toBe(true);
    expect(submitButton().textContent).toContain("Signing in…");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("preserves operator and clinic destinations from the login response", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ redirectTo: "/operator/clinics" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await renderForm();
    await fillValidCredentials();
    await submitForm();
    await flushLoginRequest();

    expect(pushMock).toHaveBeenCalledWith("/operator/clinics");
    expect(emailInput().disabled).toBe(true);
  });

  it("does not start a pending request when client validation fails", async () => {
    await renderForm();
    await submitForm();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(emailInput().disabled).toBe(false);
    expect(submitButton().disabled).toBe(false);
    expect(container.querySelector("#email-error")?.textContent).toBe(
      "Enter your email address."
    );
  });

  it("keeps native disabled controls and accessible autocomplete in source", () => {
    const formSource = readFileSync("app/(staff)/login/login-form.tsx", "utf8");
    const field = readFileSync(
      "app/(staff)/components/password-visibility-field.tsx",
      "utf8"
    );
    const css = readFileSync("app/(staff)/staff.css", "utf8");

    expect(formSource).toContain("disabled={pending}");
    expect(formSource).toContain("Signing in…");
    expect(formSource).toContain("staffLoginSpinner");
    expect(formSource).toContain("aria-busy={pending || undefined}");
    expect(formSource).toContain("Signing in. Please wait.");
    expect(formSource).not.toContain("aria-disabled");
    expect(formSource).toContain('autoComplete="email"');
    expect(field).toContain('autoComplete = "current-password"');
    expect(field).toContain("autoComplete={autoComplete}");
    expect(field).toContain("disabled={disabled}");
    expect(css).toContain(".staffLoginField:disabled");
    expect(css).toContain(".staffPasswordToggle:disabled");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain(".staffLoginSpinner");
  });
});
