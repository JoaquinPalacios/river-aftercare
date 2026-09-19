import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

describe("product typography", () => {
  it("loads Geist once from next/font and exposes a shared CSS variable", () => {
    const fonts = read("lib/branding/fonts.ts");
    const staffLayout = read("app/(staff)/layout.tsx");
    const aftercareLayout = read("app/(aftercare)/layout.tsx");
    const marketingLayout = read("app/(marketing)/layout.tsx");

    expect(fonts).toContain('from "next/font/google"');
    expect(fonts).toContain('variable: "--font-geist-sans"');
    expect(fonts).toContain('subsets: ["latin"]');
    expect(staffLayout).toContain('from "@/lib/branding/fonts"');
    expect(aftercareLayout).toContain('from "@/lib/branding/fonts"');
    expect(marketingLayout).toContain('from "@/lib/branding/fonts"');
    expect(staffLayout).not.toContain("next/font");
    expect(aftercareLayout).not.toContain("next/font");
    expect(marketingLayout).not.toContain("next/font");
    expect(aftercareLayout).not.toContain("tailwind");
    expect(marketingLayout).not.toContain("tailwind");

    const nextFontImports = walk("app")
      .concat(walk("lib"))
      .filter((path) => /\.(ts|tsx)$/.test(path))
      .filter((path) => read(path).includes("next/font"))
      .sort();

    expect(nextFontImports).toEqual(
      ["lib/branding/clinic-fonts.ts", "lib/branding/fonts.ts"].sort()
    );
    expect(read("lib/branding/clinic-fonts.ts")).toContain("preload: false");
    expect(read("lib/branding/clinic-fonts.ts")).not.toContain(
      "fonts.googleapis.com"
    );
    expect(read("lib/branding/clinic-fonts.ts")).not.toContain(
      "fonts.gstatic.com"
    );
  });

  it("keeps Geist as the product typeface and clinic fonts as a patient token", () => {
    const staffCss = read("app/(staff)/staff.css");
    const aftercareCss = read("app/(aftercare)/aftercare.css");
    const marketingCss = read("app/(marketing)/marketing.css");
    const patientCss = read("app/(aftercare)/patient.module.css");

    expect(staffCss).toContain("--font-sans: var(--font-geist-sans)");
    expect(staffCss).toContain(
      "font-family: var(--font-geist-sans), sans-serif;"
    );
    expect(aftercareCss).toContain(
      "font-family: var(--cg-font-sans, var(--font-geist-sans)), sans-serif;"
    );
    expect(aftercareCss).toContain(
      "font-family: var(--font-geist-sans), sans-serif;"
    );
    expect(marketingCss).toContain(
      "font-family: var(--font-geist-sans), sans-serif;"
    );
    expect(patientCss).toContain(
      "font-family: var(--cg-font-sans, var(--font-geist-sans)), sans-serif;"
    );
    expect(marketingCss).not.toContain("--cg-font-sans");
    expect(staffCss).not.toContain("--cg-font-sans");
    expect(aftercareCss).not.toContain("system-ui");
    expect(aftercareCss).not.toContain("ui-sans-serif");
    expect(marketingCss).not.toContain("system-ui");
    expect(marketingCss).not.toContain("-apple-system");
    expect(aftercareCss).not.toContain("tailwindcss");
    expect(aftercareCss).not.toContain("@theme");
  });
});
