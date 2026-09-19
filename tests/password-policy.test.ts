import { describe, expect, it } from "vitest";

import { PASSWORD_MAX_LENGTH } from "@/lib/auth/login-input";
import {
  NEW_PASSWORD_MAX_LENGTH,
  NEW_PASSWORD_MAX_MESSAGE,
  NEW_PASSWORD_MIN_LENGTH,
  NEW_PASSWORD_MIN_MESSAGE,
  PASSWORDS_DO_NOT_MATCH_MESSAGE,
  confirmNewPasswordError,
  newPasswordPolicyError,
} from "@/lib/auth/password-policy";
import {
  changePasswordSchema,
  resetPasswordSchema,
} from "@/app/(staff)/account/security/password-form-schema";

describe("new password policy", () => {
  it("uses centralized 12–256 bounds without composition rules", () => {
    expect(NEW_PASSWORD_MIN_LENGTH).toBe(12);
    expect(NEW_PASSWORD_MAX_LENGTH).toBe(PASSWORD_MAX_LENGTH);
    expect(NEW_PASSWORD_MAX_LENGTH).toBe(256);
    expect(newPasswordPolicyError("short")).toBe(NEW_PASSWORD_MIN_MESSAGE);
    expect(newPasswordPolicyError("abcdefghijk")).toBe(
      NEW_PASSWORD_MIN_MESSAGE
    );
    expect(newPasswordPolicyError("abcdefghijkl")).toBeNull();
    expect(newPasswordPolicyError("p".repeat(256))).toBeNull();
    expect(newPasswordPolicyError("p".repeat(257))).toBe(
      NEW_PASSWORD_MAX_MESSAGE
    );
    expect(newPasswordPolicyError("  pass phrase  ")).toBeNull();
  });

  it("does not trim passwords and requires confirmation to match exactly", () => {
    expect(
      confirmNewPasswordError("  twelve chars", "  twelve chars")
    ).toBeNull();
    expect(confirmNewPasswordError("  twelve chars", "twelve chars  ")).toBe(
      PASSWORDS_DO_NOT_MATCH_MESSAGE
    );
  });

  it("rejects 11 and 257 on change/reset schemas without trimming", () => {
    const tooShort = changePasswordSchema.safeParse({
      currentPassword: "old",
      newPassword: "abcdefghijk",
      confirmPassword: "abcdefghijk",
    });
    expect(tooShort.success).toBe(false);

    const accepted = changePasswordSchema.safeParse({
      currentPassword: "old",
      newPassword: "  twelve ch!",
      confirmPassword: "  twelve ch!",
    });
    expect(accepted.success).toBe(true);
    if (accepted.success) {
      expect(accepted.data.newPassword).toBe("  twelve ch!");
    }

    const tooLong = resetPasswordSchema.safeParse({
      newPassword: "p".repeat(257),
      confirmPassword: "p".repeat(257),
    });
    expect(tooLong.success).toBe(false);

    const max = resetPasswordSchema.safeParse({
      newPassword: "p".repeat(256),
      confirmPassword: "p".repeat(256),
    });
    expect(max.success).toBe(true);
  });
});
