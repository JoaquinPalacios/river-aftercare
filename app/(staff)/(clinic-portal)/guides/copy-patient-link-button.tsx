"use client";

import { useState } from "react";

export function CopyPatientLinkButton({ url }: { url: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle"
  );

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 2000);
  }

  const label =
    copyState === "copied"
      ? "Copied"
      : copyState === "failed"
        ? "Couldn't copy"
        : "Copy link";
  const accessibleName =
    copyState === "copied"
      ? "Live patient page link copied"
      : copyState === "failed"
        ? "Could not copy the live patient page link"
        : "Copy live patient page link";

  return (
    <>
      <button
        type="button"
        className="staffBtn staffBtnSecondary h-11 max-w-full self-start"
        onClick={() => {
          void copyLink();
        }}
        aria-label={accessibleName}
      >
        {label}
      </button>
      <p className="sr-only" aria-live="polite">
        {copyState === "copied"
          ? "Link copied"
          : copyState === "failed"
            ? "Could not copy the link"
            : ""}
      </p>
    </>
  );
}
