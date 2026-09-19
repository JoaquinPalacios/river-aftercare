import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { marketingMotionBootstrapScript } from "@/lib/marketing/motion-bootstrap";

describe("marketing motion bootstrap", () => {
  it("opts into enhancement only when motion is allowed", () => {
    const script = marketingMotionBootstrapScript();

    expect(script).toContain("prefers-reduced-motion");
    expect(script).toContain("data-mk-motion");
    expect(script).toContain("enhance");
    expect(script).toContain("reduce");
    expect(script).not.toContain("opacity:0");
    expect(script).not.toContain("localStorage");
  });

  it("keeps pending reveals fail-open without a CSS animation that fights Motion", () => {
    const css = readFileSync("app/(marketing)/marketing.css", "utf8");

    expect(css).not.toContain("mk-fail-open");
    expect(css).not.toContain("@keyframes");
    expect(css).toContain("@media (scripting: none)");
    expect(css).toContain(
      'html[data-mk-motion="enhance"] .mkReveal[data-mk-pending]'
    );
    expect(css).toContain("prefers-reduced-motion: reduce");

    const pendingHide = css.search(
      /html\[data-mk-motion="enhance"\] \.mkReveal\[data-mk-pending\] \{[\s\S]*?opacity:\s*0/
    );
    const reduceOverride = css.lastIndexOf(
      "@media (prefers-reduced-motion: reduce)"
    );
    expect(pendingHide).toBeGreaterThan(-1);
    expect(reduceOverride).toBeGreaterThan(pendingHide);
  });
});
