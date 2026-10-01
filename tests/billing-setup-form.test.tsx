/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BillingSetupSubmittedValues } from "@/app/(staff)/account/billing/setup/billing-setup-values";
import {
  INVALID_ABN_MESSAGE,
  isValidAbn,
} from "@/lib/validation/australian-business-number";

const { actionMock } = vi.hoisted(() => ({
  actionMock: vi.fn(),
}));

vi.mock("@/app/(staff)/account/billing/actions", () => ({
  continueToSecurePaymentAction: (previous: unknown, formData: FormData) =>
    actionMock(previous, formData),
}));

import { BillingSetupForm } from "@/app/(staff)/account/billing/setup/billing-setup-form";

const entered = {
  legalEntityName: "Harbour Dental Pty Ltd",
  tradingName: "Harbour Dental",
  billingContactName: "Alex Chen",
  billingEmail: "accounts@example.com",
  addressLine1: "10 River Street",
  addressLine2: "Level 2",
  city: "Tweed Heads",
  region: "NSW",
  postalCode: "2486",
  country: "AU",
  abn: "12 345 678 901",
};

function valuesFromFormData(formData: FormData): BillingSetupSubmittedValues {
  const read = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  const kind = read("businessNumberKind");
  return {
    legalEntityName: read("legalEntityName"),
    tradingName: read("tradingName"),
    billingContactName: read("billingContactName"),
    billingEmail: read("billingEmail"),
    addressLine1: read("addressLine1"),
    addressLine2: read("addressLine2"),
    city: read("city"),
    region: read("region"),
    postalCode: read("postalCode"),
    country: read("country") || "AU",
    businessNumberKind: kind === "acn" ? "acn" : "abn",
    abn: read("abn"),
    acn: read("acn"),
    termsAccepted: formData.get("termsAccepted") === "on",
  };
}

describe("billing setup form validation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    actionMock.mockReset();
    actionMock.mockImplementation(async (_previous, formData: FormData) => {
      const values = valuesFromFormData(formData);
      const fieldErrors: Record<string, string> = {};
      if (!values.legalEntityName.trim()) {
        fieldErrors.legalEntityName = "Enter the legal entity name.";
      }
      if (!values.billingEmail.includes("@")) {
        fieldErrors.billingEmail = "Enter a valid billing email.";
      }
      if (!values.postalCode.trim()) {
        fieldErrors.postalCode = "Enter the postcode.";
      }
      if (values.businessNumberKind === "abn" && !isValidAbn(values.abn)) {
        fieldErrors.abn = INVALID_ABN_MESSAGE;
      }
      if (!values.termsAccepted) {
        fieldErrors.termsAccepted =
          "Agree to the Terms & Conditions to continue.";
      }
      if (Object.keys(fieldErrors).length > 0) {
        return {
          error: "Please review the billing details.",
          fieldErrors,
          values,
        };
      }
      return {};
    });
    window.history.replaceState({}, "", "/account/billing/setup");
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
        <BillingSetupForm
          clinicName="Harbour Dental"
          planName="Essential"
          priceLabel="A$79 / month"
          annualNote={null}
          contactHref="/contact"
          termsHref="/terms"
          privacyHref="/privacy"
          regions={[
            { value: "NSW", label: "New South Wales" },
            { value: "VIC", label: "Victoria" },
          ]}
          defaults={{
            legalEntityName: "",
            tradingName: "",
            billingContactName: "",
            billingEmail: "",
            addressLine1: "",
            addressLine2: "",
            city: "",
            region: "",
            postalCode: "",
            country: "AU",
            businessNumberKind: "abn",
            abn: "",
            acn: "",
          }}
          cancelMessage={null}
        />
      );
    });
  }

  function form() {
    return container.querySelector("#billing-setup-form") as HTMLFormElement;
  }

  function input(id: string) {
    return container.querySelector(`#${id}`) as HTMLInputElement;
  }

  function select(id: string) {
    return container.querySelector(`#${id}`) as HTMLSelectElement;
  }

  function setValue(
    element: HTMLInputElement | HTMLSelectElement,
    value: string
  ) {
    const prototype =
      element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    act(() => {
      setter?.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  async function fill(values: Partial<typeof entered> = {}) {
    const next = { ...entered, ...values };
    setValue(input("legalEntityName"), next.legalEntityName);
    setValue(input("tradingName"), next.tradingName);
    setValue(input("billingContactName"), next.billingContactName);
    setValue(input("billingEmail"), next.billingEmail);
    setValue(input("addressLine1"), next.addressLine1);
    setValue(input("addressLine2"), next.addressLine2);
    setValue(input("city"), next.city);
    setValue(select("region"), next.region);
    setValue(input("postalCode"), next.postalCode);
    setValue(select("country"), next.country);
    setValue(input("abn"), next.abn);
  }

  async function submit() {
    await act(async () => {
      form().requestSubmit();
    });
  }

  function expectEntered(values: Partial<typeof entered> = {}) {
    const next = { ...entered, ...values };
    expect(input("legalEntityName").value).toBe(next.legalEntityName);
    expect(input("tradingName").value).toBe(next.tradingName);
    expect(input("billingContactName").value).toBe(next.billingContactName);
    expect(input("billingEmail").value).toBe(next.billingEmail);
    expect(input("addressLine1").value).toBe(next.addressLine1);
    expect(input("addressLine2").value).toBe(next.addressLine2);
    expect(input("city").value).toBe(next.city);
    expect(select("region").value).toBe(next.region);
    expect(input("postalCode").value).toBe(next.postalCode);
    expect(select("country").value).toBe(next.country);
    expect(input("abn").value).toBe(next.abn);
  }

  it("keeps every field, including the invalid ABN, and does not navigate", async () => {
    await renderForm();
    await fill();
    await act(async () => {
      input("termsAccepted").click();
    });
    expect(input("termsAccepted").checked).toBe(true);

    await submit();

    expect(container.textContent).toContain("Enter a valid 11-digit ABN.");
    expect(container.textContent).toContain(
      "Please review the billing details."
    );
    expectEntered();
    expect(input("termsAccepted").checked).toBe(true);
    expect(input("abn").getAttribute("aria-invalid")).toBe("true");
    expect(input("abn").getAttribute("aria-describedby")).toContain(
      "abn-error"
    );
    expect(input("abn").className).toContain("staffField");
    const error = container.querySelector("#abn-error");
    expect(error?.textContent).toBe("Enter a valid 11-digit ABN.");
    expect(error?.getAttribute("role")).toBe("alert");
    expect(document.activeElement).toBe(input("abn"));
    expect(window.location.pathname).toBe("/account/billing/setup");
    expect(window.location.href).not.toContain("checkout.stripe.com");
    expect(form()).not.toBeNull();
    expect(actionMock).toHaveBeenCalledTimes(1);
  });

  it("shows an inline ABN error before submit and keeps the typed value", async () => {
    await renderForm();
    setValue(input("abn"), "12 345 678 901");
    await act(async () => {
      input("abn").focus();
      input("abn").blur();
    });

    expect(input("abn").value).toBe("12 345 678 901");
    expect(container.textContent).toContain("Enter a valid 11-digit ABN.");
    expect(input("abn").getAttribute("aria-invalid")).toBe("true");
    expect(actionMock).not.toHaveBeenCalled();
  });

  it("accepts a spaced checksum-valid ABN without an inline error", async () => {
    await renderForm();
    setValue(input("abn"), "32 671 297 130");
    await act(async () => {
      input("abn").focus();
      input("abn").blur();
    });

    expect(input("abn").value).toBe("32 671 297 130");
    expect(container.textContent).not.toContain("Enter a valid 11-digit ABN.");
    expect(input("abn").getAttribute("aria-invalid")).toBe("false");
  });

  it("keeps the form when the action returns field errors without values", async () => {
    actionMock.mockResolvedValue({
      error: "Please review the billing details.",
      fieldErrors: { abn: "Enter a valid 11-digit ABN." },
    });
    await renderForm();
    await fill();
    await act(async () => {
      input("termsAccepted").click();
    });

    await submit();

    expectEntered();
    expect(input("termsAccepted").checked).toBe(true);
    expect(input("abn").getAttribute("aria-invalid")).toBe("true");
    expect(window.location.pathname).toBe("/account/billing/setup");
  });

  it("keeps every submitted value when email validation fails", async () => {
    await renderForm();
    await fill({
      billingEmail: "not-an-email",
      abn: "32 671 297 130",
    });
    await act(async () => {
      input("termsAccepted").click();
    });

    await submit();

    expect(container.textContent).toContain("Enter a valid billing email.");
    expect(container.textContent).not.toContain("Enter a valid 11-digit ABN.");
    expectEntered({
      billingEmail: "not-an-email",
      abn: "32 671 297 130",
    });
    expect(input("billingEmail").getAttribute("aria-invalid")).toBe("true");
    expect(input("billingEmail").getAttribute("aria-describedby")).toContain(
      "billingEmail-error"
    );
    expect(input("termsAccepted").checked).toBe(true);
    expect(document.activeElement).toBe(input("billingEmail"));
    expect(window.location.pathname).toBe("/account/billing/setup");
  });

  it("shows every field error together and keeps the Terms box unchecked", async () => {
    await renderForm();
    await fill({
      legalEntityName: "",
      billingEmail: "not-an-email",
      postalCode: "",
      abn: "32671297131",
    });

    await submit();

    expect(container.textContent).toContain("Enter the legal entity name.");
    expect(container.textContent).toContain("Enter a valid billing email.");
    expect(container.textContent).toContain("Enter the postcode.");
    expect(container.textContent).toContain("Enter a valid 11-digit ABN.");
    expect(container.textContent).toContain(
      "Agree to the Terms & Conditions to continue."
    );
    expectEntered({
      legalEntityName: "",
      billingEmail: "not-an-email",
      postalCode: "",
      abn: "32671297131",
    });
    expect(input("termsAccepted").checked).toBe(false);
    expect(input("termsAccepted").getAttribute("aria-invalid")).toBe("true");
    expect(
      input("termsAccepted").getAttribute("aria-describedby")
    ).toBeTruthy();
    expect(select("region").getAttribute("aria-invalid")).toBe("false");
    expect(document.activeElement).toBe(input("legalEntityName"));
  });

  it("submits the corrected ABN with the rest of the form unchanged", async () => {
    await renderForm();
    await fill();
    await act(async () => {
      input("termsAccepted").click();
    });
    await submit();

    setValue(input("abn"), "32 671 297 130");
    expect(container.textContent).not.toContain("Enter a valid 11-digit ABN.");
    await submit();

    expect(actionMock).toHaveBeenCalledTimes(2);
    const formData = actionMock.mock.calls[1]?.[1] as FormData;
    expect(formData.get("abn")).toBe("32 671 297 130");
    expect(formData.get("legalEntityName")).toBe("Harbour Dental Pty Ltd");
    expect(formData.get("tradingName")).toBe("Harbour Dental");
    expect(formData.get("billingContactName")).toBe("Alex Chen");
    expect(formData.get("billingEmail")).toBe("accounts@example.com");
    expect(formData.get("addressLine1")).toBe("10 River Street");
    expect(formData.get("addressLine2")).toBe("Level 2");
    expect(formData.get("city")).toBe("Tweed Heads");
    expect(formData.get("region")).toBe("NSW");
    expect(formData.get("postalCode")).toBe("2486");
    expect(formData.get("country")).toBe("AU");
    expect(formData.get("termsAccepted")).toBe("on");
    expect(container.textContent).not.toContain(
      "Please review the billing details."
    );
    expectEntered({ abn: "32 671 297 130" });
    expect(input("termsAccepted").checked).toBe(true);
    expect(window.location.pathname).toBe("/account/billing/setup");
  });

  it("uses the shared invalid field border for billing inputs", () => {
    const css = readFileSync("app/(staff)/staff.css", "utf8");
    expect(css).toContain('.staffField[aria-invalid="true"]');
    expect(css).toContain('.staffSelect[aria-invalid="true"]');
    expect(css).toContain("border-color: var(--staff-danger)");
  });
});
