import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { safeStaffReturnPath } from "@/lib/staff/safe-return-path";

describe("safe staff return path", () => {
  it("keeps in-app paths and drops external targets", () => {
    expect(safeStaffReturnPath("/operator/templates")).toBe(
      "/operator/templates"
    );
    expect(safeStaffReturnPath("/operator/templates?notice=created")).toBe(
      "/operator/templates?notice=created"
    );
    expect(safeStaffReturnPath("")).toBeNull();
    expect(safeStaffReturnPath("operator/templates")).toBeNull();
    expect(safeStaffReturnPath("//evil.example")).toBeNull();
    expect(safeStaffReturnPath("https://evil.example")).toBeNull();
    expect(safeStaffReturnPath("/\\evil.example")).toBeNull();
  });

  it("lets create template reuse its action with an optional return path", () => {
    const actions = readFileSync(
      "app/(staff)/(operator)/operator/templates/actions.ts",
      "utf8"
    );
    expect(actions).toContain('safeStaffReturnPath(formData.get("next"))');
    expect(actions).toContain("createCanonicalTemplate(parsed.data)");
    expect(actions).toContain(
      "redirect(next ?? `/operator/templates/${created.templateId}/draft`)"
    );
  });
});
