import { z } from "zod";

import {
  LOGIN_EMAIL_MAX_LENGTH,
  LOGIN_PASSWORD_MAX_LENGTH,
} from "@/lib/auth/login-input";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your email address.")
    .max(LOGIN_EMAIL_MAX_LENGTH, "Email address is too long.")
    .email("Enter a valid email address.")
    .transform((value) => value.toLowerCase()),
  password: z
    .string()
    .min(1, "Enter your password.")
    .max(LOGIN_PASSWORD_MAX_LENGTH, "Password is too long."),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
