"use server";

import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";

import { changePasswordSchema } from "@/app/(staff)/account/security/password-form-schema";
import { changeAuthenticatedUserPassword } from "@/lib/auth/change-password";
import { requireAuthenticatedUser } from "@/lib/auth/require-authenticated-user";
import {
  AUTH_SESSION_COOKIE_NAME,
  authSessionCookieOptions,
} from "@/lib/auth/session-cookie";
import { isStaffAppHost } from "@/lib/tenancy/staff-app-origin";

export interface ChangePasswordActionState {
  error?: string;
  fieldErrors?: {
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  };
  saved?: boolean;
  signedOut?: boolean;
}

const GENERIC_ERROR = "Unable to update your password right now. Try again.";

function isNextControlFlow(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    (error.digest.startsWith("NEXT_REDIRECT") ||
      error.digest.startsWith("NEXT_NOT_FOUND"))
  );
}

export async function changePasswordAction(
  _previous: ChangePasswordActionState,
  formData: FormData
): Promise<ChangePasswordActionState> {
  const host = (await headers()).get("host");
  if (!isStaffAppHost(host)) {
    notFound();
  }

  const user = await requireAuthenticatedUser();
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword") ?? "",
    newPassword: formData.get("newPassword") ?? "",
    confirmPassword: formData.get("confirmPassword") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: ChangePasswordActionState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (
        (field === "currentPassword" ||
          field === "newPassword" ||
          field === "confirmPassword") &&
        !fieldErrors[field]
      ) {
        fieldErrors[field] = issue.message;
      }
    }
    return {
      error: "Please review the highlighted fields.",
      fieldErrors,
    };
  }

  try {
    const result = await changeAuthenticatedUserPassword({
      userId: user.id,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
      confirmPassword: parsed.data.confirmPassword,
    });

    if (!result.ok) {
      return {
        error: result.error,
        fieldErrors: result.fieldErrors,
      };
    }

    const cookieStore = await cookies();
    try {
      cookieStore.set({
        ...authSessionCookieOptions,
        name: AUTH_SESSION_COOKIE_NAME,
        value: result.session.sessionToken,
        expires: result.session.expires,
      });
      return { saved: true };
    } catch {
      cookieStore.set({
        ...authSessionCookieOptions,
        name: AUTH_SESSION_COOKIE_NAME,
        value: "",
        expires: new Date(0),
      });
      return { signedOut: true };
    }
  } catch (error) {
    if (isNextControlFlow(error)) {
      throw error;
    }
    return { error: GENERIC_ERROR };
  }
}
