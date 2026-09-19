import { z } from "zod";

import { LOGIN_PASSWORD_MAX_LENGTH } from "@/lib/auth/login-input";
import {
  CURRENT_PASSWORD_REQUIRED_MESSAGE,
  CURRENT_PASSWORD_TOO_LONG_MESSAGE,
  NEW_PASSWORD_MAX_LENGTH,
  NEW_PASSWORD_MAX_MESSAGE,
  NEW_PASSWORD_MIN_LENGTH,
  NEW_PASSWORD_MIN_MESSAGE,
  PASSWORDS_DO_NOT_MATCH_MESSAGE,
} from "@/lib/auth/password-policy";

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, CURRENT_PASSWORD_REQUIRED_MESSAGE)
      .max(LOGIN_PASSWORD_MAX_LENGTH, CURRENT_PASSWORD_TOO_LONG_MESSAGE),
    newPassword: z
      .string()
      .min(NEW_PASSWORD_MIN_LENGTH, NEW_PASSWORD_MIN_MESSAGE)
      .max(NEW_PASSWORD_MAX_LENGTH, NEW_PASSWORD_MAX_MESSAGE),
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: PASSWORDS_DO_NOT_MATCH_MESSAGE,
    path: ["confirmPassword"],
  });

export const resetPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(NEW_PASSWORD_MIN_LENGTH, NEW_PASSWORD_MIN_MESSAGE)
      .max(NEW_PASSWORD_MAX_LENGTH, NEW_PASSWORD_MAX_MESSAGE),
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: PASSWORDS_DO_NOT_MATCH_MESSAGE,
    path: ["confirmPassword"],
  });
