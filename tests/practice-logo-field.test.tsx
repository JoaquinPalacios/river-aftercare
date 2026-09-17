/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pngBytes } from "./helpers/og-image-bytes";

const uploadMock = vi.hoisted(() => vi.fn());
const removeMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(staff)/(clinic-portal)/practice/logo-actions", () => ({
  uploadClinicLogoAction: uploadMock,
  removeClinicLogoAction: removeMock,
}));

import { PracticeLogoField } from "@/app/(staff)/(clinic-portal)/practice/practice-logo-field";

const configuredSrc =
  "https://assets.example.test/clinics/clinic_demo_rivers/branding/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png";
const configuredKey =
  "clinics/clinic_demo_rivers/branding/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function setInputFile(input: HTMLInputElement, file: File): void {
  const files = {
    0: file,
    length: 1,
    item: (index: number) => (index === 0 ? file : null),
    *[Symbol.iterator]() {
      yield file;
    },
  } as unknown as FileList;
  Object.defineProperty(input, "files", {
    configurable: true,
    value: files,
  });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function pngFile(
  name = "clinic-mark.png",
  size = 48 * 1024,
  width = 320,
  height = 80
): File {
  const bytes = pngBytes(width, height);
  const padded = new Uint8Array(size);
  padded.set(bytes);
  const file = new File([padded], name, { type: "image/png" });
  Object.defineProperty(file, "arrayBuffer", {
    configurable: true,
    value: () =>
      Promise.resolve(
        padded.buffer.slice(
          padded.byteOffset,
          padded.byteOffset + padded.byteLength
        )
      ),
  });
  return file;
}

function svgFile(name = "clinic-mark.svg"): File {
  const text =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#155e75"/></svg>';
  const file = new File([text], name, { type: "image/svg+xml" });
  Object.defineProperty(file, "arrayBuffer", {
    configurable: true,
    value: () => Promise.resolve(new TextEncoder().encode(text).buffer),
  });
  return file;
}

describe("practice logo field", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onLogoChange = vi.fn();

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    uploadMock.mockReset();
    removeMock.mockReset();
    onLogoChange.mockReset();
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.getElementById("clinic-logo-upload")?.remove();
  });

  async function renderField(props?: {
    logoUrl?: string | null;
    logoSrc?: string | null;
    canEdit?: boolean;
    storageAvailable?: boolean;
    displayName?: string;
  }): Promise<void> {
    await act(async () => {
      root.render(
        <PracticeLogoField
          displayName={props?.displayName ?? "Riverside Dental Demo"}
          logoUrl={props?.logoUrl ?? null}
          logoSrc={props?.logoSrc ?? null}
          canEdit={props?.canEdit ?? true}
          storageAvailable={props?.storageAvailable ?? true}
          onLogoChange={onLogoChange}
        />
      );
    });
  }

  it("keeps a visually hidden file input and explicit select-then-upload copy", () => {
    const field = source(
      "app/(staff)/(clinic-portal)/practice/practice-logo-field.tsx"
    );
    const trigger = source("app/(staff)/components/staff-file-trigger.tsx");
    const css = source("app/(staff)/staff.css");
    const sanitizer = source("lib/clinic-assets/sanitize-clinic-logo-svg.ts");
    const mutate = source("lib/clinic-assets/mutate-clinic-logo.ts");

    expect(field).toContain("StaffFileTrigger");
    expect(field).toContain("useAssetFileSelection");
    expect(field).toContain("image/svg+xml");
    expect(field).toContain(".svg");
    expect(field).toContain("Choose replacement");
    expect(field).toContain("Choose logo");
    expect(field).toContain("Upload replacement");
    expect(field).toContain("Upload logo");
    expect(field).toContain("Remove logo");
    expect(field).toContain("Cancel");
    expect(field).not.toContain("Replace logo");
    expect(field).toContain("ConfirmDialog");
    expect(field).toContain("Remove practice logo?");
    expect(field).toContain("practice name and default presentation");
    expect(field).not.toContain("R2");
    expect(field).not.toContain("bucket");
    expect(field).not.toContain("object key");
    expect(field).toContain("<img");
    expect(field).not.toContain("dangerouslySetInnerHTML");
    expect(trigger).toContain('type="file"');
    expect(trigger).toContain("staffFileInput");
    expect(css).toContain(".staffFileInput");
    expect(css).toContain("clip-path: inset(50%)");
    expect(css).toContain(".staffLogoPreview");
    expect(css).toContain("max-height: 6.5rem");
    expect(css).toContain("object-fit: contain");
    expect(sanitizer).toContain("dompurify");
    expect(sanitizer).toContain("foreignObject");
    expect(mutate).toContain('validated.kind === "svg"');
  });

  it("renders the empty upload state without an upload action", async () => {
    await renderField();

    expect(container.textContent).toContain("Practice logo");
    expect(container.textContent).toContain(
      "Shown on your patient aftercare site."
    );
    expect(container.textContent).toContain("SVG, PNG, JPEG or WebP");
    expect(container.textContent).toContain("Raster max 2 MB · SVG max 1 MB");
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("#clinic-logo-file")).toBeTruthy();
    expect(
      container.querySelector<HTMLInputElement>("#clinic-logo-file")?.className
    ).toContain("staffFileInput");
    expect(
      container.querySelector<HTMLInputElement>("#clinic-logo-file")?.accept
    ).toContain("image/svg+xml");
    expect(container.textContent).toContain("Choose logo");
    expect(container.textContent).not.toContain("Upload logo");
    expect(container.textContent).not.toContain("Upload replacement");
    expect(container.textContent).not.toContain("Remove logo");
    expect(container.textContent).not.toContain("Cancel");
    expect(container.textContent).not.toContain("Replace logo");
    expect(container.textContent).not.toContain("Choose file");
    expect(container.textContent).not.toContain("No file chosen");
    expect(container.textContent).not.toContain("No logo configured.");
  });

  it("renders the configured logo with replacement and remove actions", async () => {
    await renderField({
      logoUrl: configuredKey,
      logoSrc: configuredSrc,
    });

    const preview = container.querySelector("img");
    expect(preview?.getAttribute("src")).toBe(configuredSrc);
    expect(preview?.getAttribute("alt")).toBe(
      "Current Riverside Dental Demo logo"
    );
    expect(preview?.className).toContain("staffLogoPreview");
    expect(container.textContent).toContain("Choose replacement");
    expect(container.textContent).toContain("Remove logo");
    expect(container.textContent).toContain(
      "SVG, PNG, JPEG or WebP · Raster max 2 MB · SVG max 1 MB"
    );
    expect(container.textContent).not.toContain("Upload replacement");
    expect(container.textContent).not.toContain("Choose logo");
    expect(container.textContent).not.toContain("Replace logo");
  });

  it("shows a pending selected raster file and requires an explicit upload", async () => {
    await renderField();
    const input =
      container.querySelector<HTMLInputElement>("#clinic-logo-file");
    expect(input).toBeTruthy();

    await act(async () => {
      setInputFile(input!, pngFile());
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "clinic-mark.png · 320 × 80 · 48 KB"
    );
    expect(container.textContent).toContain("Upload logo");
    expect(container.textContent).toContain("Cancel");
    expect(container.textContent).not.toContain("Choose logo");
    expect(
      container.querySelector('button[form="clinic-logo-upload"]')
    ).toBeTruthy();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("shows SVG selection without forcing raster-only copy", async () => {
    await renderField();

    await act(async () => {
      setInputFile(container.querySelector("#clinic-logo-file")!, svgFile());
      await Promise.resolve();
    });

    expect(container.textContent).toContain("clinic-mark.svg");
    expect(container.textContent).toContain("Upload logo");
    expect(
      container.querySelector("#clinic-logo-file")?.getAttribute("accept")
    ).toContain("image/svg+xml");
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("cancels a selected replacement without changing the persisted logo", async () => {
    await renderField({
      logoUrl: configuredKey,
      logoSrc: configuredSrc,
    });
    const input =
      container.querySelector<HTMLInputElement>("#clinic-logo-file");

    await act(async () => {
      setInputFile(input!, pngFile("next.png"));
    });

    expect(container.textContent).toContain("Upload replacement");
    expect(container.textContent).toContain("next.png");

    await act(async () => {
      const cancel = [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Cancel"
      );
      cancel?.click();
    });

    expect(container.textContent).toContain("Choose replacement");
    expect(container.textContent).not.toContain("Upload replacement");
    expect(container.textContent).not.toContain("next.png");
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      configuredSrc
    );
    expect(input?.value).toBe("");
  });

  it("does not enable upload until a file is selected", async () => {
    await renderField({
      logoUrl: configuredKey,
      logoSrc: configuredSrc,
    });
    expect(
      container.querySelector('button[form="clinic-logo-upload"]')
    ).toBeNull();

    await act(async () => {
      setInputFile(container.querySelector("#clinic-logo-file")!, pngFile());
    });

    const upload = container.querySelector<HTMLButtonElement>(
      'button[form="clinic-logo-upload"]'
    );
    expect(upload).toBeTruthy();
    expect(upload?.disabled).toBe(false);
    expect(upload?.textContent).toBe("Upload replacement");
  });

  it("resets the pending file and shows the persisted preview after a successful upload", async () => {
    uploadMock.mockResolvedValue({
      ok: true,
      logoUrl:
        "clinics/clinic_demo_rivers/branding/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png",
      logoSrc:
        "https://assets.example.test/clinics/clinic_demo_rivers/branding/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png",
    });
    await renderField();

    await act(async () => {
      setInputFile(container.querySelector("#clinic-logo-file")!, pngFile());
    });
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[form="clinic-logo-upload"]')
        ?.click();
    });

    expect(uploadMock).toHaveBeenCalled();
    expect(container.textContent).toContain("Practice logo updated.");
    expect(container.textContent).toContain("Choose replacement");
    expect(container.textContent).not.toContain("clinic-mark.png");
    expect(container.textContent).not.toContain("Upload logo");
    expect(container.querySelector("img")?.getAttribute("src")).toContain(
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png"
    );
    expect(onLogoChange).toHaveBeenCalledWith({
      logoUrl:
        "clinics/clinic_demo_rivers/branding/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png",
      logoSrc:
        "https://assets.example.test/clinics/clinic_demo_rivers/branding/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png",
    });
  });

  it("keeps the existing logo and selected file after a failed upload", async () => {
    uploadMock.mockResolvedValue({
      error: "Choose a PNG, JPEG, WebP, or SVG image.",
    });
    await renderField({
      logoUrl: configuredKey,
      logoSrc: configuredSrc,
    });

    await act(async () => {
      setInputFile(
        container.querySelector("#clinic-logo-file")!,
        pngFile("bad.png")
      );
    });
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[form="clinic-logo-upload"]')
        ?.click();
    });

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("PNG, JPEG, WebP, or SVG");
    expect(container.textContent).toContain("bad.png");
    expect(container.textContent).toContain("Upload replacement");
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      configuredSrc
    );
    expect(onLogoChange).not.toHaveBeenCalled();
  });

  it("confirms removal of the configured practice logo", async () => {
    removeMock.mockResolvedValue({
      ok: true,
      logoUrl: null,
      logoSrc: null,
    });
    await renderField({
      logoUrl: configuredKey,
      logoSrc: configuredSrc,
    });

    await act(async () => {
      const remove = [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Remove logo"
      );
      remove?.click();
    });

    expect(document.body.textContent).toContain("Remove practice logo?");
    expect(document.body.textContent).toContain(
      "practice name and default presentation"
    );
    expect(document.body.textContent).not.toContain("R2");
    expect(removeMock).not.toHaveBeenCalled();

    await act(async () => {
      const confirm = [...document.querySelectorAll("button")].find(
        (button) =>
          button.textContent === "Remove logo" && button.closest("dialog")
      );
      confirm?.click();
    });

    expect(removeMock).toHaveBeenCalled();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("Choose logo");
    expect(container.textContent).toContain("Practice logo removed.");
    expect(onLogoChange).toHaveBeenCalledWith({ logoUrl: null, logoSrc: null });
  });

  it("disables actions while an upload is pending", async () => {
    let finish:
      | ((value: { ok: true; logoUrl: string; logoSrc: string }) => void)
      | undefined;
    uploadMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    await renderField();

    await act(async () => {
      setInputFile(container.querySelector("#clinic-logo-file")!, pngFile());
    });
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[form="clinic-logo-upload"]')
        ?.click();
    });

    const upload = container.querySelector<HTMLButtonElement>(
      'button[form="clinic-logo-upload"]'
    );
    const cancel = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Cancel"
    );
    expect(upload?.disabled).toBe(true);
    expect(upload?.textContent).toBe("Uploading…");
    expect(cancel?.disabled).toBe(true);
    expect(
      container.querySelector("#clinic-logo-file")?.hasAttribute("disabled")
    ).toBe(true);

    await act(async () => {
      finish?.({
        ok: true,
        logoUrl:
          "clinics/clinic_demo_rivers/branding/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png",
        logoSrc:
          "https://assets.example.test/clinics/clinic_demo_rivers/branding/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png",
      });
    });
  });

  it("keeps STAFF read-only when canEdit is false", async () => {
    await renderField({
      logoUrl: configuredKey,
      logoSrc: configuredSrc,
      canEdit: false,
    });

    expect(container.querySelector("#clinic-logo-file")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      configuredSrc
    );
    expect(container.querySelector("img")?.getAttribute("alt")).toBe(
      "Current Riverside Dental Demo logo"
    );
    expect(container.textContent).not.toContain("Choose replacement");
    expect(container.textContent).not.toContain("Choose logo");
    expect(container.textContent).not.toContain("Remove logo");
    expect(container.textContent).not.toContain("Upload logo");
  });

  it("keeps clinic ADMIN mutation controls when canEdit is true", async () => {
    await renderField({
      logoUrl: configuredKey,
      logoSrc: configuredSrc,
      canEdit: true,
    });

    expect(container.querySelector("#clinic-logo-file")).toBeTruthy();
    expect(container.textContent).toContain("Choose replacement");
    expect(container.textContent).toContain("Remove logo");
  });
});
