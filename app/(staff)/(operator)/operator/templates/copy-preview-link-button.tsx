"use client";

import { useState } from "react";

export function CopyPreviewLinkButton({ path }: { path: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle"
  );

  async function copyLink() {
    try {
      const url = new URL(path, window.location.origin).href;
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 2000);
  }

  const label =
    copyState === "copied"
      ? "Preview link copied"
      : copyState === "failed"
        ? "Couldn't copy"
        : "Copy preview link";

  return (
    <>
      <button
        type="button"
        className="staffBtn staffBtnSecondary"
        data-preview-path={path}
        onClick={() => {
          void copyLink();
        }}
      >
        {label}
      </button>
      <p className="sr-only" aria-live="polite">
        {copyState === "copied"
          ? "Preview link copied"
          : copyState === "failed"
            ? "Could not copy the preview link"
            : ""}
      </p>
    </>
  );
}
