/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_PLATFORM_SEO,
  marketingPageSeoFields,
} from "@/lib/seo/defaults";
import { MARKETING_SEO_PATHS } from "@/lib/seo/types";
import type { SeoActionState } from "@/app/(staff)/(operator)/operator/seo/actions";

const saveMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(staff)/(operator)/operator/seo/actions", () => ({
  savePlatformSeoAction: (previous: SeoActionState, formData: FormData) =>
    saveMock(previous, formData),
  uploadPlatformSeoOgImageAction: async () => ({}),
  removePlatformSeoOgImageAction: async () => ({}),
}));

import { SeoDiscoveryForm } from "@/app/(staff)/(operator)/operator/seo/seo-discovery-form";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const pages = MARKETING_SEO_PATHS.map((path) => ({
  path,
  ...marketingPageSeoFields(path),
  updatedAt: null,
}));

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("SEO page editor", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    saveMock.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  async function renderForm() {
    await act(async () => {
      root.render(
        <SeoDiscoveryForm
          identity={DEFAULT_PLATFORM_SEO}
          pages={pages}
          storageAvailable={false}
          ogImageSrc={null}
        />
      );
    });
  }

  function pageGroup(path: string) {
    const input = container.querySelector<HTMLInputElement>(
      path === "/" ? "#homeSeoTitle" : `#${path.slice(1)}SeoTitle`
    );
    return input?.closest("[role='group']") ?? null;
  }

  function navButtons() {
    const nav = container.querySelector('nav[aria-label="Marketing pages"]');
    return [...(nav?.querySelectorAll("button") ?? [])];
  }

  it("shows one page at a time and keeps edits on the others", async () => {
    await renderForm();

    const home = pageGroup("/");
    const pricing = pageGroup("/pricing");
    expect(home?.hasAttribute("hidden")).toBe(false);
    expect(pricing?.hasAttribute("hidden")).toBe(true);
    expect(container.querySelector("#seo-selected-page")?.textContent).toBe(
      "Home"
    );
    expect(container.querySelector("#seo-selected-page")?.className).toContain(
      "text-base"
    );
    expect(navButtons().map((button) => button.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("/")])
    );
    expect(navButtons()[0]?.getAttribute("aria-current")).toBe("page");
    expect(
      navButtons().map((button) => button.textContent?.replace(/\s+/g, " "))
    ).toEqual(
      MARKETING_SEO_PATHS.map((path) =>
        path === "/"
          ? expect.stringContaining("Home")
          : expect.stringContaining(path)
      )
    );

    const homeTitle =
      container.querySelector<HTMLInputElement>("#homeSeoTitle");
    const pricingTitle =
      container.querySelector<HTMLInputElement>("#pricingSeoTitle");
    expect(homeTitle?.value).toContain(
      "Patient Aftercare Software for Clinics"
    );
    expect(pricingTitle?.value).toContain("Pricing");

    await act(async () => {
      setInputValue(homeTitle!, "Edited home title");
    });
    await act(async () => {
      navButtons()
        .find((button) => button.textContent?.includes("Pricing"))
        ?.click();
    });

    expect(pageGroup("/")?.hasAttribute("hidden")).toBe(true);
    expect(pageGroup("/pricing")?.hasAttribute("hidden")).toBe(false);
    expect(container.querySelector("#seo-selected-page")?.textContent).toBe(
      "Pricing"
    );
    expect(pricingTitle?.value).toContain("Pricing");
    expect(homeTitle?.value).toBe("Edited home title");

    await act(async () => {
      setInputValue(pricingTitle!, "Edited pricing title");
    });
    expect(homeTitle?.value).toBe("Edited home title");
    expect(pricingTitle?.value).toBe("Edited pricing title");

    const select =
      container.querySelector<HTMLSelectElement>("#seo-page-select");
    expect(select?.value).toBe("/pricing");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value"
      )?.set;
      setter?.call(select, "/about");
      select?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelector("#seo-selected-page")?.textContent).toBe(
      "About"
    );
    expect(homeTitle?.value).toBe("Edited home title");
  });

  it("shows a spinner while saving and still submits every page", async () => {
    const pending = deferred<SeoActionState>();
    saveMock.mockImplementation(() => pending.promise);
    await renderForm();

    const homeTitle =
      container.querySelector<HTMLInputElement>("#homeSeoTitle");
    await act(async () => {
      setInputValue(homeTitle!, "Edited home title");
      navButtons()
        .find((button) => button.textContent?.includes("Pricing"))
        ?.click();
    });

    const form = container.querySelector("form") as HTMLFormElement;
    const save = () =>
      container.querySelector<HTMLButtonElement>("button[type='submit']");
    expect(save()?.textContent).toBe("Save changes");
    expect(container.querySelector(".staffBtnSpinner")).toBeNull();

    await act(async () => {
      form.requestSubmit();
    });

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(save()?.disabled).toBe(true);
    expect(save()?.textContent).toContain("Saving");
    expect(container.querySelector(".staffBtnSpinner")).not.toBeNull();
    const formData = saveMock.mock.calls[0]?.[1] as FormData;
    expect(formData.get("homeSeoTitle")).toBe("Edited home title");
    expect(formData.get("pricingSeoTitle")).toContain("Pricing");
    expect(formData.get("aboutSeoTitle")).toBeTruthy();

    await act(async () => {
      form.requestSubmit();
    });
    expect(saveMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve({ success: "SEO & Discovery settings saved." });
    });
    expect(save()?.disabled).toBe(false);
    expect(save()?.textContent).toBe("Save changes");
    expect(container.querySelector(".staffBtnSpinner")).toBeNull();
    expect(container.textContent).toContain("SEO & Discovery settings saved.");
  });

  it("opens the page that failed validation and keeps the error", async () => {
    saveMock.mockResolvedValue({
      error: "Please review the SEO fields.",
      fieldErrors: {
        "pages./pricing.seoTitle": "Enter an SEO title.",
      },
    });
    await renderForm();
    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });
    expect(pageGroup("/pricing")?.hasAttribute("hidden")).toBe(false);
    expect(pageGroup("/")?.hasAttribute("hidden")).toBe(true);
    expect(container.textContent).toContain("Please review the SEO fields.");
    expect(pageGroup("/pricing")?.textContent).toContain("Enter an SEO title.");
    expect(container.querySelector(".staffBtnSpinner")).toBeNull();
  });
});
