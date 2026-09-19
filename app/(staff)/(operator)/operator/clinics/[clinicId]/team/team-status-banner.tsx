"use client";

import { useEffect } from "react";

export function TeamStatusBanner({ message }: { message: string }) {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("status")) {
      return;
    }
    url.searchParams.delete("status");
    const query = url.searchParams.toString();
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${query ? `?${query}` : ""}`
    );
  }, []);

  return (
    <p className="text-sm text-staff-ink" role="status">
      {message}
    </p>
  );
}
