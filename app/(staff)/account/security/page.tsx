import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { PRIVATE_ROBOTS } from "@/lib/seo/robots-policy";

export const metadata: Metadata = {
  title: `Account security · ${PRODUCT_NAME}`,
  description: `Change your ${PRODUCT_NAME} password.`,
  robots: PRIVATE_ROBOTS,
};

export default function AccountSecurityPage() {
  redirect("/account#security");
}
