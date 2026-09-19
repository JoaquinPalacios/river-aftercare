import "server-only";

import { redirect } from "next/navigation";

import { type AuthenticatedUser, getCurrentUser } from "@/lib/auth/session";

export async function requireAuthenticatedUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}
