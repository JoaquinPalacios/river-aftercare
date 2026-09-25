import "server-only";

import { z } from "zod";

import {
  LOGIN_EMAIL_INVALID_MESSAGE,
  LOGIN_EMAIL_MAX_LENGTH,
  LOGIN_EMAIL_REQUIRED_MESSAGE,
  LOGIN_EMAIL_TOO_LONG_MESSAGE,
  LOGIN_PASSWORD_MAX_LENGTH,
  LOGIN_PASSWORD_REQUIRED_MESSAGE,
  LOGIN_PASSWORD_TOO_LONG_MESSAGE,
} from "@/lib/auth/login-input";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, LOGIN_EMAIL_REQUIRED_MESSAGE)
    .max(LOGIN_EMAIL_MAX_LENGTH, LOGIN_EMAIL_TOO_LONG_MESSAGE)
    .email(LOGIN_EMAIL_INVALID_MESSAGE)
    .transform((value) => value.toLowerCase()),
  password: z
    .string()
    .min(1, LOGIN_PASSWORD_REQUIRED_MESSAGE)
    .max(LOGIN_PASSWORD_MAX_LENGTH, LOGIN_PASSWORD_TOO_LONG_MESSAGE),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
