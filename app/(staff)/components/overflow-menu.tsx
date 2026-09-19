"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export function OverflowMenu({
  label,
  children,
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  const reactId = useId().replace(/:/g, "");
  const menuId = `overflow-${reactId}`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function placeMenu() {
    const menu = menuRef.current;
    const button = buttonRef.current;
    if (!menu || !button) {
      return;
    }

    const rect = button.getBoundingClientRect();
    const width = Math.max(menu.offsetWidth, 224);
    const left = Math.min(
      Math.max(8, rect.right - width),
      window.innerWidth - width - 8
    );
    menu.style.top = `${rect.bottom + 6}px`;
    menu.style.left = `${left}px`;
  }

  useEffect(() => {
    const menu = menuRef.current;
    const button = buttonRef.current;
    if (!menu || !button) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu.matches(":popover-open")) {
        menu.hidePopover();
        button.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!disabled) {
      return;
    }
    menuRef.current?.hidePopover?.();
  }, [disabled]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        className="staffBtn staffBtnQuiet px-2"
        popoverTarget={menuId}
        popoverTargetAction="toggle"
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-label={label}
        disabled={disabled}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      <div
        ref={menuRef}
        id={menuId}
        popover="auto"
        role="menu"
        className="staffOverflowMenu"
        onBeforeToggle={(event) => {
          if (event.newState === "open") {
            placeMenu();
          }
        }}
        onToggle={(event) => {
          if (event.newState === "open") {
            placeMenu();
            const first =
              menuRef.current?.querySelector<HTMLElement>("[role='menuitem']");
            first?.focus();
            return;
          }
          buttonRef.current?.focus();
        }}
      >
        {children}
      </div>
    </div>
  );
}
