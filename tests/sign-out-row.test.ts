import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("sign out row", () => {
  it("uses the full sidebar utility row hit area", () => {
    const logout = readFileSync(
      "app/(staff)/components/logout-button.tsx",
      "utf8"
    );
    const chrome = readFileSync(
      "app/(staff)/components/portal-chrome.tsx",
      "utf8"
    );
    const panel = readFileSync(
      "app/(staff)/components/staff-account-panel.tsx",
      "utf8"
    );
    const css = readFileSync("app/(staff)/staff.css", "utf8");

    expect(logout).toContain("staffNavRow staffSignOut");
    expect(logout).not.toContain("staffBtnDanger");
    expect(chrome).toContain("StaffAccountPanel");
    expect(panel).toContain("staffAccountBlock");
    expect(css).toContain(".staffSignOut");
    expect(css).toContain("min-height: var(--staff-nav-row-h)");
  });
});
