import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("practice publication has no attestation step", () => {
  it("publishes without reading or writing review attestation", () => {
    const publish = readFileSync(
      "lib/clinic-portal/publish-practice-guide.ts",
      "utf8"
    );
    const editor = readFileSync(
      "app/(staff)/(clinic-portal)/guides/guide-editor.tsx",
      "utf8"
    );
    const actions = readFileSync(
      "app/(staff)/(clinic-portal)/guides/actions.ts",
      "utf8"
    );

    expect(publish).not.toContain("reviewAttested");
    expect(publish).not.toContain("PRACTICE_REVIEW_ATTESTATION");
    expect(editor).not.toContain("reviewAttested");
    expect(editor).not.toContain("PRACTICE_REVIEW_ATTESTATION");
    expect(editor).toContain("Publish guide");
    expect(editor).toContain('saving ? "Saving…" : "Save"');
    expect(actions).not.toContain("reviewAttested");
  });
});
