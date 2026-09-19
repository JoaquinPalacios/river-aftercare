import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("staff confirm dialog", () => {
  it("keeps native dialog semantics with application chrome", () => {
    const dialog = readFileSync(
      "app/(staff)/components/confirm-dialog.tsx",
      "utf8"
    );
    const css = readFileSync("app/(staff)/staff.css", "utf8");

    expect(dialog).toContain("<dialog");
    expect(dialog).toContain("showModal");
    expect(dialog).toContain("staffDialogHeader");
    expect(dialog).toContain("autoFocus");
    expect(dialog).not.toContain("window.confirm");
    expect(css).toContain(".staffDialog::backdrop");
    expect(css).toContain("color-scheme: inherit");
    expect(dialog).toContain("pendingLabel");
    expect(dialog).toContain("staffLoginSpinner");
    expect(dialog).toContain("aria-busy={busy || undefined}");
    expect(dialog).toContain("disabled={busy");
    expect(dialog).toContain("confirmLockedRef");
  });
});
