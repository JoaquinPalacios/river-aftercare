import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("navigation progress tokens", () => {
  const interaction = readFileSync("app/interaction.css", "utf8");
  const marketing = readFileSync("app/(marketing)/marketing.css", "utf8");
  const staff = readFileSync("app/(staff)/staff.css", "utf8");
  const aftercare = readFileSync("app/(aftercare)/aftercare.css", "utf8");
  const styles = readFileSync("app/components/navigation-progress.css", "utf8");
  const packageJson = readFileSync("package.json", "utf8");
  const marketingLayout = readFileSync("app/(marketing)/layout.tsx", "utf8");
  const staffLayout = readFileSync("app/(staff)/layout.tsx", "utf8");
  const aftercareLayout = readFileSync("app/(aftercare)/layout.tsx", "utf8");
  const component = readFileSync(
    "app/components/navigation-progress.tsx",
    "utf8"
  );

  it("defines one master River progress token layer", () => {
    expect(styles).toContain("--progress-start: #3b4bd1");
    expect(styles).toContain("--progress-mid: #3b4bd1");
    expect(styles).toContain("--progress-end: #146f88");
    expect(styles).toContain("--progress-start: #7c8cff");
    expect(styles).toContain("--progress-mid: #a6b8ff");
    expect(styles).toContain("--progress-end: #7ec8e6");
    expect(styles).not.toContain("light-dark(");
    expect(styles).toContain("--progress-height: 2px");
    expect(styles).toContain("--progress-z-index: 40");
    expect(styles).toContain("prefers-reduced-motion");
    expect(styles).toContain("--progress-width-duration: 0ms");
    expect(interaction).not.toContain("--progress-start");
    expect(aftercare).not.toContain("--progress-start");
    expect(aftercare).not.toContain("navigationProgress");

    expect(marketing).toContain("--progress-start: var(--mk-brand-strong)");
    expect(marketing).toContain("--progress-mid: var(--mk-brand)");
    expect(marketing).toContain("--progress-end: var(--mk-sky-text)");
    expect(marketing).not.toContain("--progress-start: var(--vertical-accent)");

    expect(staff).toContain("--progress-start: #3b4bd1");
    expect(staff).toContain("--progress-end: #146f88");
    expect(staff).toContain('html[data-theme-mode="dark"]');
    expect(staff).toContain("--progress-start: #7c8cff");
    expect(staff).toContain("--progress-mid: #a6b8ff");
    expect(staff).toContain("--progress-end: #7ec8e6");
    expect(packageJson).not.toContain("nprogress");
    expect(packageJson).not.toContain("nextjs-toploader");
  });

  it("keeps the bar thin, fixed, and visually inert for assistive tech", () => {
    expect(styles).toContain("position: fixed");
    expect(styles).toContain("top: 0");
    expect(styles).toContain("pointer-events: none");
    expect(styles).toContain("scaleX(var(--progress-value, 0))");
    expect(styles).toContain("prefers-reduced-motion: reduce");
    expect(component).toContain('aria-hidden="true"');
    expect(component).not.toContain('role="progressbar"');
  });

  it("mounts the shared component on marketing and staff roots only", () => {
    expect(marketingLayout).toContain("NavigationProgress");
    expect(staffLayout).toContain("NavigationProgress");
    expect(aftercareLayout).not.toContain("NavigationProgress");
    expect(marketingLayout).not.toMatch(/['"]use client['"]/);
    expect(staffLayout).not.toMatch(/['"]use client['"]/);
  });
});
