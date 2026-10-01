import type { ReactNode } from "react";

import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";

import "@/app/(aftercare)/aftercare.css";

export default async function CanonicalTemplatePreviewLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requirePlatformOperator();
  return children;
}
