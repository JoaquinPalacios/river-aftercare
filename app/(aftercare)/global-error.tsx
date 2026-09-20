"use client";

import { GlobalErrorDocument } from "@/app/components/global-error-document";
import type { AppRouterErrorProps } from "@/lib/errors/app-router-error";

export default function AftercareGlobalError(props: AppRouterErrorProps) {
  return <GlobalErrorDocument {...props} />;
}
