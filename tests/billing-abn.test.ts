import { describe, expect, it } from "vitest";

import {
  isValidAbn,
  isValidAcn,
  parseAustralianBusinessIdentity,
} from "@/lib/billing/australian-business-numbers";

describe("Australian business numbers", () => {
  it("accepts a valid ABN and rejects malformed values", () => {
    expect(isValidAbn("32 671 297 130")).toBe(true);
    expect(isValidAbn("32671297130")).toBe(true);
    expect(isValidAbn("32671297131")).toBe(false);
    expect(isValidAbn("123")).toBe(false);
  });

  it("accepts a valid ACN and rejects malformed values", () => {
    expect(isValidAcn("000 000 019")).toBe(true);
    expect(isValidAcn("000000019")).toBe(true);
    expect(isValidAcn("000000018")).toBe(false);
    expect(isValidAcn("123")).toBe(false);
  });

  it("allows ABN only, ACN only, or neither, and never requires both", () => {
    expect(parseAustralianBusinessIdentity({})).toEqual({
      abn: null,
      acn: null,
    });
    expect(parseAustralianBusinessIdentity({ abn: "32 671 297 130" })).toEqual({
      abn: "32671297130",
      acn: null,
    });
    expect(parseAustralianBusinessIdentity({ acn: "000 000 019" })).toEqual({
      abn: null,
      acn: "000000019",
    });
    expect(
      parseAustralianBusinessIdentity({
        abn: "32 671 297 130",
        acn: "000 000 019",
      })
    ).toEqual({ abn: "32671297130", acn: "000000019" });
  });
});
