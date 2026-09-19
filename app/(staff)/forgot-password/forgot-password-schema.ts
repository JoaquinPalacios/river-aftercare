import { z } from "zod";

import { LOGIN_EMAIL_MAX_LENGTH } from "@/lib/auth/login-input";

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your email address.")
    .max(LOGIN_EMAIL_MAX_LENGTH, "Email address is too long.")
    .email("Enter a valid email address.")
    .transform((value) => value.toLowerCase()),
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
