/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { CanonicalPatientPreview } from "@/app/(staff)/(operator-preview)/operator/templates/canonical-patient-preview";
import { PRODUCT_ISOLOGO_SRC } from "@/lib/branding/product-assets";
import { CANONICAL_PREVIEW_BRAND_NOTE } from "@/lib/canonical-templates/preview-brand";
import type { OperatorTemplateRevisionView } from "@/lib/operator/canonical-templates/load-operator-canonical-template";

const print = vi.fn();

function revision(status: "DRAFT" | "PUBLISHED"): OperatorTemplateRevisionView {
  return {
    id: status === "DRAFT" ? "rev-draft" : "rev-published",
    version: status === "DRAFT" ? 2 : 1,
    status,
    createdAtLabel: "1 Oct 2026",
    createdByLabel: null,
    publishedAtLabel: status === "PUBLISHED" ? "1 Oct 2026" : null,
    publisherLabel: null,
    sectionCount: 3,
    isLatestPublished: status === "PUBLISHED",
    sections: [
      {
        key: "intro",
        kind: "INTRODUCTION",
        title: "After your visit",
        body: "Rest and follow the instructions below.",
        periodLabel: "",
        startDay: "",
        endDay: "",
        homeCareInstructions: [],
      },
      {
        key: "stage",
        kind: "RECOVERY_TIMELINE",
        title: "First day",
        body: "Keep the area still.",
        periodLabel: "Today",
        startDay: "0",
        endDay: "1",
        homeCareInstructions: [],
      },
      {
        key: "warning",
        kind: "WARNING_SIGNS",
        title: "Warning signs",
        body: "Contact the practice if pain increases.",
        periodLabel: "",
        startDay: "",
        endDay: "",
        homeCareInstructions: [],
      },
    ],
  };
}

describe("operator template preview printing", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    print.mockClear();
    window.print = print;
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

  function render(status: "DRAFT" | "PUBLISHED") {
    act(() => {
      root.render(
        <CanonicalPatientPreview
          templateId="template-print"
          templateTitle="Sample recovery guide"
          revision={revision(status)}
        />
      );
    });
  }

  function printButton() {
    return [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Print / Save as PDF")
    ) as HTMLButtonElement | undefined;
  }

  it("prints from an explicit button on published and draft previews", () => {
    render("PUBLISHED");
    expect(print).not.toHaveBeenCalled();
    const publishedButton = printButton();
    expect(publishedButton).toBeTruthy();
    expect(publishedButton?.type).toBe("button");
    expect(publishedButton?.closest(".staffPreviewToolbar")).toBeTruthy();
    expect(publishedButton?.querySelector("svg")).toBeTruthy();
    expect(container.textContent).toContain("River Aftercare Demo Clinic");
    expect(container.innerHTML).toContain(PRODUCT_ISOLOGO_SRC);
    expect(container.textContent).toContain("Sample recovery guide");
    expect(container.textContent).toContain(
      "Rest and follow the instructions below."
    );
    expect(container.textContent).toContain("First day");
    expect(container.textContent).toContain("Warning signs");
    expect(container.querySelector("[data-guide-document]")).toBeTruthy();
    expect(
      container.querySelector("[data-guide-document]")?.textContent
    ).not.toContain("template-print");
    expect(container.textContent).toContain(CANONICAL_PREVIEW_BRAND_NOTE);
    expect(container.textContent).not.toContain("Download PDF");
    expect(container.innerHTML.toLowerCase()).not.toContain("qr");

    act(() => {
      publishedButton?.click();
    });
    expect(print).toHaveBeenCalledTimes(1);

    render("DRAFT");
    expect(container.textContent).toContain("Revision 2 · Draft");
    const draftButton = printButton();
    expect(draftButton?.closest(".staffPreviewToolbar")).toBeTruthy();
    act(() => {
      draftButton?.click();
    });
    expect(print).toHaveBeenCalledTimes(2);
    expect(draftButton?.closest("[data-guide-document]")).toBeNull();
  });

  it("keeps print styling independent of the operator theme and hides administration", () => {
    document.documentElement.setAttribute("data-theme-mode", "dark");
    render("PUBLISHED");
    const style = container.querySelector("style")?.textContent ?? "";
    const printCss = style.slice(style.lastIndexOf("@media print"));
    expect(printCss.startsWith("@media print")).toBe(true);
    expect(printCss).toContain("color-scheme:light");
    expect(printCss).toContain("--cg-surface:#ffffff");
    expect(printCss).toContain("--cg-text:#111318");
    expect(printCss).toContain("--cg-brand:#3b4bd1");
    expect(printCss).not.toContain("#8ea0ff");
    expect(printCss).not.toContain("--cg-surface:#111318");

    const staffCss = readFileSync("app/(staff)/staff.css", "utf8");
    const staffPrint = staffCss.slice(staffCss.lastIndexOf("@media print"));
    expect(staffPrint).toContain(".staffPreviewToolbar");
    expect(staffPrint).toContain(".templatePreviewBrandNote");
    expect(staffPrint).toContain("display: none !important");
    expect(staffPrint).toContain("background: #ffffff !important");

    const patientCss = readFileSync(
      "app/(aftercare)/patient.module.css",
      "utf8"
    );
    const aftercareCss = readFileSync("app/(aftercare)/aftercare.css", "utf8");
    expect(aftercareCss).toContain("size: A4 portrait");
    expect(patientCss).toContain("break-after: avoid");
    expect(patientCss).toContain("break-inside: auto");
    expect(patientCss).toContain("break-inside: avoid");
    expect(patientCss).toContain("orphans: 3");
    expect(patientCss).toContain("widows: 3");
    expect(patientCss).toContain("break-after: auto");
    expect(patientCss).toContain(".section:not(:has(.planList))");
    expect(patientCss).toContain('data-print-flow="break"');
    expect(patientCss).toContain("break-before: avoid");
    const printBlock = patientCss.slice(patientCss.lastIndexOf("@media print"));
    expect(printBlock).toContain(".disclaimer");
    expect(printBlock).toContain(".footer");
    const cardRule = printBlock.match(
      /\.planItem,\s*\.timelineItem,[\s\S]*?\}/
    )?.[0];
    expect(cardRule).toContain("break-inside: avoid");
    expect(cardRule).toContain("break-after: auto");
    expect(cardRule).not.toContain("break-after: avoid");
    expect(printBlock).toMatch(/\.disclaimer,[\s\S]*?break-after:\s*avoid/);
    expect(printBlock).toMatch(/\.footer\s*\{[\s\S]*?break-before:\s*avoid/);

    const toolbar = readFileSync(
      "app/(staff)/(guide-preview)/guides/[guideId]/preview/staff-preview-toolbar.tsx",
      "utf8"
    );
    expect(toolbar).toContain("window.print()");
    expect(toolbar).not.toContain("useEffect");
    const clinicPreview = readFileSync(
      "app/(staff)/(guide-preview)/guides/[guideId]/preview/page.tsx",
      "utf8"
    );
    expect(clinicPreview).not.toContain("printLabel");
    expect(clinicPreview).not.toContain("Print / Save as PDF");
  });
});
