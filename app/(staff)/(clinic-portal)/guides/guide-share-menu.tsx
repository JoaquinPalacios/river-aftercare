"use client";

import { useEffect, useId, useRef, useState } from "react";

import { shareMenuPanelPosition } from "@/lib/staff/share-menu-frame";

export function GuideShareMenu({
  publicUrl,
  svgHref,
  pngHref,
}: {
  publicUrl: string;
  svgHref: string;
  pngHref: string;
}) {
  const reactId = useId().replace(/:/g, "");
  const panelId = `guide-share-${reactId}`;
  const statusId = `${panelId}-status`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle"
  );

  function placePanel() {
    const panel = panelRef.current;
    const button = buttonRef.current;
    if (!panel || !button) {
      return;
    }

    const rect = button.getBoundingClientRect();
    const frame = shareMenuPanelPosition({
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      buttonTop: rect.top,
      buttonRight: rect.right,
      buttonBottom: rect.bottom,
      panelWidth: panel.offsetWidth,
      panelHeight: panel.offsetHeight,
    });
    panel.style.top = `${frame.top}px`;
    panel.style.left = `${frame.left}px`;
    panel.style.width = `${frame.width}px`;
  }

  useEffect(() => {
    const panel = panelRef.current;
    const button = buttonRef.current;
    if (!panel || !button) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && panel.matches(":popover-open")) {
        panel.hidePopover();
        button.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 2000);
  }

  const copyLabel =
    copyState === "copied"
      ? "Copied"
      : copyState === "failed"
        ? "Couldn't copy"
        : "Copy link";

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        className="staffBtn staffBtnQuiet"
        popoverTarget={panelId}
        popoverTargetAction="toggle"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
      >
        Share
      </button>
      <div
        ref={panelRef}
        id={panelId}
        popover="auto"
        role="dialog"
        aria-label="Share published guide"
        className="staffShareMenu"
        onBeforeToggle={(event) => {
          if (event.newState === "open") {
            placePanel();
          }
        }}
        onToggle={(event) => {
          const nextOpen = event.newState === "open";
          setOpen(nextOpen);
          if (nextOpen) {
            placePanel();
            panelRef.current
              ?.querySelector<HTMLElement>("[data-share-focus]")
              ?.focus();
            return;
          }
          setCopyState("idle");
          buttonRef.current?.focus();
        }}
      >
        <p className="staffShareLabel" id={`${panelId}-url`}>
          Public patient link
        </p>
        <a
          data-share-focus
          className="staffShareUrl"
          href={publicUrl}
          target="_blank"
          rel="noreferrer"
          aria-describedby={`${panelId}-url`}
        >
          {publicUrl}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        <p id={statusId} className="sr-only" aria-live="polite">
          {copyState === "copied"
            ? "Link copied"
            : copyState === "failed"
              ? "Could not copy the link"
              : ""}
        </p>
        <button
          type="button"
          className="staffOverflowItem"
          onClick={() => {
            void copyLink();
          }}
        >
          {copyLabel}
        </button>
        <a className="staffOverflowItem" href={svgHref} download>
          Download QR (SVG)
        </a>
        <a className="staffOverflowItem" href={pngHref} download>
          Download QR (PNG)
        </a>
      </div>
    </div>
  );
}
