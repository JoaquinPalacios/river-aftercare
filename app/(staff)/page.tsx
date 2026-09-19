import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getAuthContext } from "@/lib/auth/session";
import { signedInHomePath } from "@/lib/auth/signed-in-home";
import { PRODUCT_NAME } from "@/lib/branding/product-name";

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: `Sign in to ${PRODUCT_NAME}.`,
};

export default async function Home() {
  const authContext = await getAuthContext().catch(() => ({
    user: null,
    clinicMembership: null,
  }));

  redirect(signedInHomePath(authContext) ?? "/login");
}
