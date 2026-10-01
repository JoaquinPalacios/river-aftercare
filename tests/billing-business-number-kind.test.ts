import { describe, expect, it } from "vitest";

import { businessNumberKindFromSaved } from "@/lib/billing/business-number-kind";

describe("billing setup identifier selection", () => {
  it("selects ABN, ACN, or None from saved values", () => {
    expect(businessNumberKindFromSaved({ abn: "32671297130", acn: null })).toBe(
      "abn"
    );
    expect(businessNumberKindFromSaved({ abn: null, acn: "000000019" })).toBe(
      "acn"
    );
    expect(businessNumberKindFromSaved({ abn: null, acn: null })).toBe("none");
    expect(businessNumberKindFromSaved({})).toBe("none");
  });

  it("shows ABN when an older row has both identifiers", () => {
    expect(
      businessNumberKindFromSaved({
        abn: "32671297130",
        acn: "000000019",
      })
    ).toBe("abn");
  });
});
