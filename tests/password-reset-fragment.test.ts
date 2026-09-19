import { describe, expect, it } from "vitest";

import { generateAccountToken } from "@/lib/auth/account-token";
import {
  isWellFormedRawAccountToken,
  readAccountTokenFromHash,
  readPasswordResetTokenFromHash,
} from "@/lib/auth/account-token-format";

describe("reset token fragment parsing", () => {
  it("reads a well-formed token from a URL fragment", () => {
    const token = generateAccountToken();
    expect(isWellFormedRawAccountToken(token)).toBe(true);
    expect(readPasswordResetTokenFromHash(`#token=${token}`)).toBe(token);
    expect(readPasswordResetTokenFromHash(`token=${token}`)).toBe(token);
    expect(readAccountTokenFromHash(`#token=${token}`)).toBe(token);
  });

  it("rejects missing, query-like, and malformed fragments", () => {
    expect(readPasswordResetTokenFromHash("")).toBeNull();
    expect(readPasswordResetTokenFromHash("#")).toBeNull();
    expect(readPasswordResetTokenFromHash("#token=")).toBeNull();
    expect(readPasswordResetTokenFromHash("#token=abc def")).toBeNull();
    expect(readPasswordResetTokenFromHash("?token=abc")).toBeNull();
    expect(readPasswordResetTokenFromHash("#token=abc+def")).toBeNull();
  });
});
