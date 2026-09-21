"use client";

import { useEffect } from "react";

import { reportClientException } from "@/lib/observability/report-client-exception";

export function ClientErrorReporter({ error }: { error: unknown }) {
  useEffect(() => {
    reportClientException(error);
  }, [error]);

  return null;
}
