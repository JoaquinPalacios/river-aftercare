/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pngBytes } from "./helpers/og-image-bytes";

const uploadMock = vi.hoisted(() => vi.fn());
const removeMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(staff)/(operator)/operator/seo/actions", () => ({
  uploadPlatformSeoOgImageAction: uploadMock,
  removePlatformSeoOgImageAction: removeMock,
}));

import { DefaultOgImageField } from "@/app/(staff)/(operator)/operator/seo/og-image-field";

const configuredSrc =
  "https://assets.example.test/platform/seo/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png";
const configuredPath = "/platform/seo/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png";

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

function pngFile(name = "share.png", size = 196 * 1024): File {
  const bytes = pngBytes();
  const padded = new Uint8Array(size);
  padded.set(bytes);
  return new File([padded], name, { type: "image/png" });
}

describe("default social sharing image field", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    uploadMock.mockReset();
    removeMock.mockReset();
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
    document.getElementById("platform-og-upload")?.remove();
  });

  async function renderField(props: {
    imagePath: string | null;
    imageSrc: string | null;
    storageAvailable?: boolean;
  }): Promise<void> {
    await act(async () => {
      root.render(
        <DefaultOgImageField
          storageAvailable={props.storageAvailable ?? true}
          imagePath={props.imagePath}
          imageSrc={props.imageSrc}
        />
      );
    });
  }

  it("keeps a visually hidden file input and explicit select-then-upload copy", () => {
    const field = source(
      "app/(staff)/(operator)/operator/seo/og-image-field.tsx"
    );
    const css = source("app/(staff)/staff.css");
    const form = source(
      "app/(staff)/(operator)/operator/seo/seo-discovery-form.tsx"
    );

    expect(field).toContain('type="file"');
    expect(field).toContain("staffFileInput");
    expect(field).toContain("image/png,image/jpeg,image/webp");
    expect(field).toContain("Choose replacement");
    expect(field).toContain("Choose image");
    expect(field).toContain("Upload replacement");
    expect(field).toContain("Upload image");
    expect(field).toContain("Remove image");
    expect(field).toContain("Cancel");
    expect(field).not.toContain("Replace image");
    expect(field).toContain("ConfirmDialog");
    expect(field).toContain(
      "Page-level social image overrides are not affected"
    );
    expect(field).not.toContain("R2");
    expect(field).not.toContain("bucket");
    expect(field).not.toContain("object key");
    expect(css).toContain(".staffFileInput");
    expect(css).toContain("clip-path: inset(50%)");
    expect(css).toContain("aspect-ratio: 1200 / 630");
    expect(form).toContain(
      "Pages can still set their own social image override"
    );
    expect(form).toContain("Site name");
    expect(form).toContain("sameAsUrls");
    expect(form).toContain("DefaultOgImageField");
    expect(form).not.toContain(
      "Use a dedicated 1200 × 630 social sharing image"
    );
  });

  it("renders the empty upload state without an upload action", async () => {
    await renderField({ imagePath: null, imageSrc: null });

    expect(container.textContent).toContain("Default social sharing image");
    expect(container.textContent).toContain(
      "Used when a page does not have its own social image."
    );
    expect(container.textContent).toContain("Social sharing image");
    expect(container.textContent).toContain(
      "1200 × 630 · PNG, JPEG or WebP · max 2 MB"
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("#platform-og-file")).toBeTruthy();
    expect(
      container.querySelector<HTMLInputElement>("#platform-og-file")?.className
    ).toContain("staffFileInput");
    expect(container.textContent).toContain("Choose image");
    expect(container.textContent).not.toContain("Upload image");
    expect(container.textContent).not.toContain("Upload replacement");
    expect(container.textContent).not.toContain("Remove image");
    expect(container.textContent).not.toContain("Cancel");
    expect(container.textContent).not.toContain("Choose file");
    expect(container.textContent).not.toContain("No file chosen");
  });

  it("renders the configured image with replacement and remove actions", async () => {
    await renderField({
      imagePath: configuredPath,
      imageSrc: configuredSrc,
    });

    const preview = container.querySelector("img");
    expect(preview?.getAttribute("src")).toBe(configuredSrc);
    expect(preview?.getAttribute("alt")).toBe(
      "Configured default social sharing image"
    );
    expect(container.textContent).toContain("Choose replacement");
    expect(container.textContent).toContain("Remove image");
    expect(container.textContent).toContain("Recommended: 1200 × 630");
    expect(container.textContent).toContain("Max 2 MB");
    expect(container.textContent).not.toContain("Upload replacement");
    expect(container.textContent).not.toContain("Choose image");
  });

  it("shows a pending selected file and requires an explicit upload", async () => {
    await renderField({ imagePath: null, imageSrc: null });
    const input =
      container.querySelector<HTMLInputElement>("#platform-og-file");
    expect(input).toBeTruthy();

    await act(async () => {
      setInputFile(input!, pngFile());
    });

    expect(container.textContent).toContain("share.png · 1200 × 630 · 196 KB");
    expect(container.textContent).toContain("Upload image");
    expect(container.textContent).toContain("Cancel");
    expect(container.textContent).not.toContain("Choose image");
    expect(
      container.querySelector('button[form="platform-og-upload"]')
    ).toBeTruthy();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("cancels a selected replacement without changing the persisted image", async () => {
    await renderField({
      imagePath: configuredPath,
      imageSrc: configuredSrc,
    });
    const input =
      container.querySelector<HTMLInputElement>("#platform-og-file");

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
      imagePath: configuredPath,
      imageSrc: configuredSrc,
    });
    expect(
      container.querySelector('button[form="platform-og-upload"]')
    ).toBeNull();

    await act(async () => {
      setInputFile(container.querySelector("#platform-og-file")!, pngFile());
    });

    const upload = container.querySelector<HTMLButtonElement>(
      'button[form="platform-og-upload"]'
    );
    expect(upload).toBeTruthy();
    expect(upload?.disabled).toBe(false);
    expect(upload?.textContent).toBe("Upload replacement");
  });

  it("resets the pending file and shows the persisted preview after a successful upload", async () => {
    uploadMock.mockResolvedValue({
      ok: true,
      defaultOgImagePath:
        "/platform/seo/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png",
      imageSrc:
        "https://assets.example.test/platform/seo/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png",
    });
    await renderField({ imagePath: null, imageSrc: null });

    await act(async () => {
      setInputFile(container.querySelector("#platform-og-file")!, pngFile());
    });
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[form="platform-og-upload"]')
        ?.click();
    });

    expect(uploadMock).toHaveBeenCalled();
    expect(container.textContent).toContain(
      "Default social sharing image updated."
    );
    expect(container.textContent).toContain("Choose replacement");
    expect(container.textContent).not.toContain("share.png");
    expect(container.textContent).not.toContain("Upload image");
    expect(container.querySelector("img")?.getAttribute("src")).toContain(
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png"
    );
  });

  it("keeps the selected file and shows a local error after a failed upload", async () => {
    uploadMock.mockResolvedValue({
      error: "Choose a PNG, JPEG, or WebP image that is exactly 1200 × 630.",
    });
    await renderField({ imagePath: null, imageSrc: null });

    await act(async () => {
      setInputFile(container.querySelector("#platform-og-file")!, pngFile());
    });
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[form="platform-og-upload"]')
        ?.click();
    });

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("exactly 1200 × 630");
    expect(container.textContent).toContain("share.png");
    expect(container.textContent).toContain("Upload image");
    expect(container.querySelector("img")).toBeNull();
  });

  it("confirms removal of the configured default social image", async () => {
    removeMock.mockResolvedValue({
      ok: true,
      defaultOgImagePath: null,
      imageSrc: null,
    });
    await renderField({
      imagePath: configuredPath,
      imageSrc: configuredSrc,
    });

    await act(async () => {
      const remove = [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Remove image"
      );
      remove?.click();
    });

    expect(document.body.textContent).toContain("Remove default social image?");
    expect(document.body.textContent).toContain(
      "Page-level social image overrides are not affected."
    );
    expect(removeMock).not.toHaveBeenCalled();

    await act(async () => {
      const confirm = [...document.querySelectorAll("button")].find(
        (button) =>
          button.textContent === "Remove image" && button.closest("dialog")
      );
      confirm?.click();
    });

    expect(removeMock).toHaveBeenCalled();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("Choose image");
    expect(container.textContent).toContain(
      "Default social sharing image removed."
    );
  });

  it("disables actions while an upload is pending", async () => {
    let finish:
      | ((value: {
          ok: true;
          defaultOgImagePath: string;
          imageSrc: string;
        }) => void)
      | undefined;
    uploadMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    await renderField({ imagePath: null, imageSrc: null });

    await act(async () => {
      setInputFile(container.querySelector("#platform-og-file")!, pngFile());
    });
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[form="platform-og-upload"]')
        ?.click();
    });

    const upload = container.querySelector<HTMLButtonElement>(
      'button[form="platform-og-upload"]'
    );
    const cancel = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Cancel"
    );
    expect(upload?.disabled).toBe(true);
    expect(upload?.textContent).toBe("Uploading…");
    expect(cancel?.disabled).toBe(true);
    expect(
      container.querySelector("#platform-og-file")?.hasAttribute("disabled")
    ).toBe(true);

    await act(async () => {
      finish?.({
        ok: true,
        defaultOgImagePath:
          "/platform/seo/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png",
        imageSrc:
          "https://assets.example.test/platform/seo/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png",
      });
    });
  });
});
