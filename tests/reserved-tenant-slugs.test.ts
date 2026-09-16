import { describe, expect, it } from "vitest";

import { createOperatorClinicSchema } from "@/lib/operator/create-operator-clinic";
import {
  isReservedTenantSlug,
  RESERVED_TENANT_SLUGS,
} from "@/lib/tenancy/reserved-slugs";

describe("reserved tenant slugs", () => {
  it("reserves assets so it cannot be a clinic hostname", () => {
    expect(RESERVED_TENANT_SLUGS).toContain("assets");
    expect(isReservedTenantSlug("assets")).toBe(true);
  });

  it("rejects operator clinic creation with slug assets", () => {
    const parsed = createOperatorClinicSchema.safeParse({
      name: "Assets Clinic",
      slug: "assets",
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) {
      return;
    }
    expect(parsed.error.issues.some((issue) => issue.path[0] === "slug")).toBe(
      true
    );
    expect(
      parsed.error.issues.some(
        (issue) =>
          issue.message === "That hostname is reserved by the platform."
      )
    ).toBe(true);
  });
});
