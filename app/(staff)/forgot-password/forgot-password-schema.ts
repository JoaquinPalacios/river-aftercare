import "server-only";

import { z } from "zod";

import {
  LOGIN_EMAIL_INVALID_MESSAGE,
  LOGIN_EMAIL_MAX_LENGTH,
  LOGIN_EMAIL_REQUIRED_MESSAGE,
  LOGIN_EMAIL_TOO_LONG_MESSAGE,
} from "@/lib/auth/login-input";

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, LOGIN_EMAIL_REQUIRED_MESSAGE)
    .max(LOGIN_EMAIL_MAX_LENGTH, LOGIN_EMAIL_TOO_LONG_MESSAGE)
    .email(LOGIN_EMAIL_INVALID_MESSAGE)
    .transform((value) => value.toLowerCase()),
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
