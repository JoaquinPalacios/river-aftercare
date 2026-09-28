/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AutosizeTextarea } from "@/app/(staff)/components/autosize-textarea";

describe("autosize textarea", () => {
  let container: HTMLDivElement;
  let root: Root;
  let scrollHeight: PropertyDescriptor | undefined;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    scrollHeight = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "scrollHeight"
    );
    Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return 480;
      },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (scrollHeight) {
      Object.defineProperty(
        HTMLTextAreaElement.prototype,
        "scrollHeight",
        scrollHeight
      );
    }
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("uses a three-row field that grows to the measured content", () => {
    act(() => {
      root.render(
        <AutosizeTextarea
          aria-label="Guidance"
          defaultValue={"Line\n".repeat(12)}
        />
      );
    });
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea.rows).toBe(3);
    expect(textarea.className).toContain("staffField");
    expect(textarea.className).toContain("staffAutosizeField");
    expect(textarea.getAttribute("data-autosize")).toBe("");
    expect(textarea.style.height).toBe("480px");

    const css = readFileSync("app/(staff)/staff.css", "utf8");
    const autosize = css.slice(
      css.indexOf("textarea.staffField.staffAutosizeField {"),
      css.indexOf(".staffSelect {")
    );
    expect(autosize).toContain("min-height: calc(1.5em * 3 + 1rem)");
    expect(autosize).toContain("max-height: calc(1.5em * 6 + 1rem)");
    expect(autosize).toContain("overflow-y: auto");
    expect(autosize).toContain("resize: none");
  });
});
