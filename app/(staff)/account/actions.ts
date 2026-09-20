"use server";

import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { updateOwnProfileSchema } from "@/lib/auth/account-profile-schema";
import { requireAuthenticatedUser } from "@/lib/auth/require-authenticated-user";
import { updateOwnProfile } from "@/lib/auth/update-own-profile";
import { isStaffAppHost } from "@/lib/tenancy/staff-app-origin";

export interface UpdateProfileActionState {
  error?: string;
  fieldErrors?: {
    name?: string;
    email?: string;
    currentPassword?: string;
  };
  saved?: boolean;
  emailChanged?: boolean;
}

const GENERIC_ERROR = "Unable to update your profile right now. Try again.";

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

export async function updateProfileAction(
  _previous: UpdateProfileActionState,
  formData: FormData
): Promise<UpdateProfileActionState> {
  const host = (await headers()).get("host");
  if (!isStaffAppHost(host)) {
    notFound();
  }

  const user = await requireAuthenticatedUser();
  const parsed = updateOwnProfileSchema.safeParse({
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    currentPassword: formData.get("currentPassword") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: UpdateProfileActionState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (
        (field === "name" ||
          field === "email" ||
          field === "currentPassword") &&
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
    const result = await updateOwnProfile({
      userId: user.id,
      name: parsed.data.name,
      email: parsed.data.email,
      currentPassword: parsed.data.currentPassword,
    });

    if (!result.ok) {
      return {
        error: result.error,
        fieldErrors: result.fieldErrors,
      };
    }

    return {
      saved: true,
      emailChanged: result.emailChanged,
    };
  } catch (error) {
    if (isNextControlFlow(error)) {
      throw error;
    }
    return { error: GENERIC_ERROR };
  }
}
