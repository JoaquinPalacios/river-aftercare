/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replaceMock = vi.hoisted(() => vi.fn());
const refreshMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
    refresh: refreshMock,
  }),
}));

import { AcceptInvitationForm } from "@/app/(staff)/accept-invitation/accept-invitation-form";
import { INVITATION_INVALID_LINK_MESSAGE } from "@/lib/auth/password-policy";

function deferredResponse() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("accept invitation fragment form", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    replaceMock.mockReset();
    refreshMock.mockReset();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    window.history.replaceState(null, "", "/accept-invitation");
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it("shows the invalid-link state when the fragment is missing", async () => {
    await act(async () => {
      root.render(<AcceptInvitationForm />);
    });
    expect(container.textContent).toContain(INVITATION_INVALID_LINK_MESSAGE);
    expect(container.textContent).toContain(
      "Contact your clinic administrator or River Aftercare"
    );
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks a well-formed token before showing the password form", async () => {
    const token = "Aa1-_".repeat(8) + "abcde";
    window.history.replaceState(null, "", `/accept-invitation#token=${token}`);
    const pending = deferredResponse();
    fetchMock.mockReturnValue(pending.promise);

    await act(async () => {
      root.render(<AcceptInvitationForm />);
    });

    expect(container.textContent).toContain("Checking invitation…");
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const statusCall = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(statusCall[0]).toBe("/api/auth/invitation-status");
    expect(JSON.parse(String(statusCall[1]?.body))).toEqual({ token });
    expect(window.location.hash).toBe(`#token=${token}`);

    await act(async () => {
      pending.resolve(
        new Response(JSON.stringify({ valid: true }), { status: 200 })
      );
    });

    expect(container.querySelectorAll('input[type="password"]')).toHaveLength(2);
    expect(container.textContent).not.toContain("Checking invitation…");
  });

  it("shows the invalid-link state when status says the invitation is unusable", async () => {
    const token = "Aa1-_".repeat(8) + "abcde";
    window.history.replaceState(null, "", `/accept-invitation#token=${token}`);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ valid: false }), { status: 200 })
    );

    await act(async () => {
      root.render(<AcceptInvitationForm />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain(INVITATION_INVALID_LINK_MESSAGE);
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/api/auth/invitation-status",
    ]);
  });

  it("submits the fragment token in the POST body and navigates to login", async () => {
    const token = "Aa1-_".repeat(8) + "abcde";
    window.history.replaceState(null, "", `/accept-invitation#token=${token}`);
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/auth/invitation-status") {
        return new Response(JSON.stringify({ valid: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    await act(async () => {
      root.render(<AcceptInvitationForm />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const inputs = container.querySelectorAll('input[type="password"]');
    expect(inputs).toHaveLength(2);
    const newPassword = inputs[0] as HTMLInputElement;
    const confirm = inputs[1] as HTMLInputElement;
    await act(async () => {
      const descriptor = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      );
      descriptor?.set?.call(newPassword, "abcdefghijkl");
      newPassword.dispatchEvent(new Event("input", { bubbles: true }));
      newPassword.dispatchEvent(new Event("change", { bubbles: true }));
      descriptor?.set?.call(confirm, "abcdefghijkl");
      confirm.dispatchEvent(new Event("input", { bubbles: true }));
      confirm.dispatchEvent(new Event("change", { bubbles: true }));
      container
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        );
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const acceptCall = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(acceptCall[0]).toBe("/api/auth/accept-invitation");
    expect(JSON.parse(String(acceptCall[1]?.body))).toEqual({
      token,
      newPassword: "abcdefghijkl",
      confirmPassword: "abcdefghijkl",
    });
    expect(window.location.hash).toBe("");
    expect(replaceMock).toHaveBeenCalledWith("/login?invite=success");
    expect(window.localStorage.getItem(token)).toBeNull();
    expect(window.sessionStorage.getItem(token)).toBeNull();
  });
});
