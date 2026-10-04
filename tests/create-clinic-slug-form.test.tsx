/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CARE_GUIDE_SLUG_MAX_LENGTH,
  CARE_GUIDE_SLUG_MIN_LENGTH,
} from "@/lib/aftercare/slug-rules";
import { isDemoTenant } from "@/lib/aftercare/demo-tenant";
import { suggestGuideSlug } from "@/lib/clinics/slug-suggestion";
import { isSharedDemoHostnameLabel } from "@/lib/tenancy/shared-demo-hostname";
import { isReservedTenantSlug } from "@/lib/tenancy/reserved-slugs";

const { actionMock } = vi.hoisted(() => ({
  actionMock: vi.fn(),
}));

vi.mock("@/app/(staff)/(operator)/operator/actions", () => ({
  createClinicAction: (previous: unknown, formData: FormData) =>
    actionMock(previous, formData),
}));

import { CreateClinicForm } from "@/app/(staff)/(operator)/operator/clinics/new/create-clinic-form";

function slugFieldError(slug: string): string | null {
  if (slug.length < CARE_GUIDE_SLUG_MIN_LENGTH) {
    return `Too small: expected string to have >=${CARE_GUIDE_SLUG_MIN_LENGTH} characters`;
  }
  if (slug.length > CARE_GUIDE_SLUG_MAX_LENGTH) {
    return `Too big: expected string to have <=${CARE_GUIDE_SLUG_MAX_LENGTH} characters`;
  }
  if (isReservedTenantSlug(slug)) {
    return "That hostname is reserved by the platform.";
  }
  if (isDemoTenant(slug) || isSharedDemoHostnameLabel(slug)) {
    return "That hostname is reserved for the interactive demo.";
  }
  return null;
}

describe("create clinic slug", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    actionMock.mockReset();
    actionMock.mockImplementation(async (_previous, formData: FormData) => {
      const slugError = slugFieldError(String(formData.get("slug") ?? ""));
      if (slugError) {
        return {
          error: "Please review the clinic details.",
          fieldErrors: { slug: slugError },
        };
      }
      return {};
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<CreateClinicForm />);
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function name() {
    return container.querySelector("#name") as HTMLInputElement;
  }

  function slug() {
    return container.querySelector("#slug") as HTMLInputElement;
  }

  function setValue(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    act(() => {
      setter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  async function submit() {
    const form = container.querySelector("form");
    await act(async () => {
      form?.requestSubmit();
    });
  }

  function submittedSlug() {
    const formData = actionMock.mock.calls.at(-1)?.[1] as FormData | undefined;
    return formData?.get("slug");
  }

  it("starts with an empty practice name and tenant slug", () => {
    expect(name().value).toBe("");
    expect(slug().value).toBe("");
    expect(name().name).toBe("name");
    expect(slug().name).toBe("slug");
    expect(name().required).toBe(true);
    expect(slug().required).toBe(true);
    expect(slug().placeholder).toBe("riverside-dental");
    expect(slug().getAttribute("autocapitalize")).toBe("none");
    expect(slug().getAttribute("autocomplete")).toBe("off");
    expect(slug().getAttribute("spellcheck")).toBe("false");
    expect(slug().getAttribute("aria-describedby")).toBe("slug-hint");
    expect(slug().className).toContain("h-11");
    expect(slug().className).toContain("border-staff-line");
    expect(container.querySelector("#slug-hint")?.textContent).toContain(
      "Generated from the practice name until you edit it."
    );
    expect(container.textContent).toContain("Create clinic");
    expect(container.textContent).not.toContain("Please review the clinic");
  });

  it("generates the tenant slug from the practice name until the slug is edited", () => {
    setValue(name(), "Harbour");
    expect(slug().value).toBe("harbour");
    setValue(name(), "Harbour Dental");
    expect(slug().value).toBe("harbour-dental");
    expect(slug().value).toBe(suggestGuideSlug("Harbour Dental"));
  });

  it("keeps a manually edited slug when the practice name changes", () => {
    setValue(name(), "Harbour Dental");
    setValue(slug(), "custom-harbour");
    setValue(name(), "North Shore Dental");
    expect(name().value).toBe("North Shore Dental");
    expect(slug().value).toBe("custom-harbour");
  });

  it("keeps a slug that was edited before the practice name, including a cleared slug", () => {
    setValue(slug(), "chosen-slug");
    setValue(name(), "Harbour Dental");
    expect(slug().value).toBe("chosen-slug");

    setValue(slug(), "");
    setValue(name(), "Another Practice");
    expect(slug().value).toBe("");
  });

  it("preserves a manual slug even when it matches the generated value", () => {
    setValue(name(), "Harbour Dental");
    setValue(slug(), "harbour-dental-edited");
    setValue(slug(), "harbour-dental");
    setValue(name(), "Harbour Dental Plus");
    expect(slug().value).toBe("harbour-dental");
  });

  it("collapses whitespace, punctuation, and accents without adding a suffix", () => {
    setValue(name(), "  Harbour   Dental!! ");
    expect(slug().value).toBe("harbour-dental");
    setValue(name(), "Harbour & Dental");
    expect(slug().value).toBe("harbour-dental");
    setValue(name(), "Café Dental");
    expect(slug().value).toBe("cafe-dental");
    setValue(name(), "OK");
    expect(slug().value).toBe("ok");
    setValue(name(), "Admin");
    expect(slug().value).toBe("admin");
    expect(slug().value).not.toMatch(/-2$/);
    expect(slug().value).not.toBe("admin-site");

    const longName = "Harbour Dental Aftercare Instructions For New Patients";
    setValue(name(), longName);
    expect(slug().value).toBe(suggestGuideSlug(longName));
    expect(slug().value.length).toBeLessThanOrEqual(CARE_GUIDE_SLUG_MAX_LENGTH);
    expect(slug().value.endsWith("-")).toBe(false);
  });

  it("submits the generated slug and leaves length and reserved slugs for the server", async () => {
    setValue(name(), "Harbour Dental");
    await submit();
    expect(submittedSlug()).toBe("harbour-dental");
    expect(container.textContent).not.toContain("Please review the clinic");

    setValue(name(), "OK");
    await submit();
    expect(slug().value).toBe("ok");
    expect(submittedSlug()).toBe("ok");
    expect(slug().getAttribute("aria-invalid")).toBe("true");
    expect(container.querySelector("#slug-error")?.textContent).toContain(
      ">=3"
    );

    setValue(name(), "Admin");
    await submit();
    expect(slug().value).toBe("admin");
    expect(submittedSlug()).toBe("admin");
    expect(container.querySelector("#slug-error")?.textContent).toBe(
      "That hostname is reserved by the platform."
    );
    expect(slug().value).not.toBe("admin-2");
    expect(slug().value).not.toBe("admin-site");
  });

  it("keeps the operator's slug when the server reports a duplicate", async () => {
    actionMock.mockImplementation(async (_previous, formData: FormData) => {
      const slugError = slugFieldError(String(formData.get("slug") ?? ""));
      if (slugError) {
        return {
          error: "Please review the clinic details.",
          fieldErrors: { slug: slugError },
        };
      }
      if (formData.get("slug") === "harbour-dental") {
        return { error: "That tenant slug is already in use." };
      }
      return {};
    });

    setValue(name(), "Harbour Dental");
    await submit();
    expect(submittedSlug()).toBe("harbour-dental");
    expect(slug().value).toBe("harbour-dental");
    expect(container.textContent).toContain(
      "That tenant slug is already in use."
    );
    expect(slug().value).not.toBe("harbour-dental-2");
  });
});
