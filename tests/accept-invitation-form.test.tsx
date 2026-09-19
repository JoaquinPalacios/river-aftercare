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
  });

  it("submits the fragment token in the POST body and navigates to login", async () => {
    const token = "Aa1-_".repeat(8) + "abcde";
    window.history.replaceState(null, "", `/accept-invitation#token=${token}`);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    await act(async () => {
      root.render(<AcceptInvitationForm />);
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

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe("/api/auth/accept-invitation");
    expect(JSON.parse(String(call[1]?.body))).toEqual({
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
