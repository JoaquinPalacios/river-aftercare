import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("clinic portal layout roles and shell", () => {
  it("renders clinic-facing role labels and a viewport-fixed desktop shell", () => {
    const layout = readFileSync(
      "app/(staff)/(clinic-portal)/layout.tsx",
      "utf8"
    );
    const operator = readFileSync(
      "app/(staff)/components/operator-account-chrome.tsx",
      "utf8"
    );
    const chrome = readFileSync(
      "app/(staff)/components/portal-chrome.tsx",
      "utf8"
    );
    const css = readFileSync("app/(staff)/staff.css", "utf8");

    expect(layout).toContain("clinicMembershipRoleLabel");
    expect(layout).not.toContain('"Admin"');
    expect(layout).not.toContain('"Staff"');
    expect(operator).toContain("PLATFORM_OPERATOR_ROLE_LABEL");
    expect(operator).not.toContain(">Operator<");
    expect(chrome).toContain("staffAppShell");
    expect(chrome).toContain("staffAppSidebar");
    expect(chrome).toContain('<main className="staffAppScroller">');
    expect(chrome).toContain('<div className="staffAppContent">');
    expect(chrome).toContain("inert={!open || undefined}");
    expect(operator).toContain('<main className="staffAppScroller">');
    expect(operator).toContain('<div className="staffAppContent">');
    expect(css).toContain("height: 100dvh");
    expect(css).toContain("html:has(.staffAppShell)");
    expect(css).toContain("min-height: 0");
    expect(css).toContain("flex: 1 1 0");
    expect(css).toContain("overflow-x: clip");
    expect(css).toContain("scrollbar-gutter: stable");
    expect(css).toContain("container: staff-editor / inline-size");
    expect(css).toContain("@container staff-editor (min-width: 56rem)");
    expect(css).not.toContain("overflow-x: auto;\n    overflow-y: auto");
  });
});
