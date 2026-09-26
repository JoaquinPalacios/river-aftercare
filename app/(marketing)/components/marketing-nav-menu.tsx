"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { MarketingNavTheme } from "@/app/(marketing)/components/marketing-nav-theme";

import styles from "../marketing.module.css";

export type MarketingMenuItem = {
  href: string;
  label: string;
  current?: boolean;
  themeId?: string;
};

export function MarketingNavMenu({
  items,
  clinicItems,
  staffHref,
  onOpenChange,
}: {
  items: MarketingMenuItem[];
  clinicItems: MarketingMenuItem[];
  staffHref: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const reactId = useId().replace(/:/g, "");
  const menuId = `mk-nav-${reactId}`;
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const openIntentRef = useRef<"pointer" | "keyboard">("pointer");
  const onOpenChangeRef = useRef(onOpenChange);
  const [open, setOpen] = useState(false);
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    const menu = menuRef.current;
    const trigger = triggerRef.current;
    if (!menu || !trigger) {
      return;
    }

    const markPointer = () => {
      openIntentRef.current = "pointer";
    };
    const markKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        openIntentRef.current = "keyboard";
      }
    };

    const sync = () => {
      const nextOpen = menu.matches(":popover-open");
      setOpen(nextOpen);
      onOpenChangeRef.current?.(nextOpen);
      if (!nextOpen) {
        return;
      }

      // Keyboard open: move to the first link so Tab/Enter continue in-menu.
      // Pointer/touch open: park focus on the panel so About is not pre-selected.
      // Visible rings stay on :focus-visible only.
      if (openIntentRef.current === "keyboard") {
        const first = menu.querySelector("a");
        if (first instanceof HTMLElement) {
          first.focus({ preventScroll: true });
        }
        return;
      }

      menu.focus({ preventScroll: true });
    };

    trigger.addEventListener("pointerdown", markPointer);
    trigger.addEventListener("keydown", markKeyboard);
    menu.addEventListener("toggle", sync);
    return () => {
      trigger.removeEventListener("pointerdown", markPointer);
      trigger.removeEventListener("keydown", markKeyboard);
      menu.removeEventListener("toggle", sync);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        menuRef.current?.hidePopover();
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className={styles.navMenu}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.navMenuTrigger}
        popoverTarget={menuId}
        popoverTargetAction="toggle"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Site menu"
      >
        <span className={styles.navMenuGlyph} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>
      <div
        ref={menuRef}
        id={menuId}
        popover="auto"
        tabIndex={-1}
        className={styles.navMenuPanel}
      >
        <ul className={styles.navMenuList}>
          <li className={styles.navMenuGroup}>
            <p className={styles.navMenuGroupLabel} id={`${menuId}-clinics`}>
              For clinics
            </p>
            <ul
              className={styles.navMenuSublist}
              aria-labelledby={`${menuId}-clinics`}
            >
              {clinicItems.map((item, index) => (
                <li
                  key={item.href}
                  className={
                    index === 0 ? styles.navMenuOverview : styles.navMenuItem
                  }
                >
                  <Link
                    className={styles.navMenuRow}
                    href={item.href}
                    aria-current={item.current ? "page" : undefined}
                    data-vertical={item.themeId}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
          {items.map((item) => (
            <li key={item.label}>
              <Link
                className={styles.navMenuRow}
                href={item.href}
                aria-current={item.current ? "page" : undefined}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className={styles.navMenuMeta}>
          <a className={styles.navMenuRow} href={staffHref}>
            Sign in
          </a>
          <MarketingNavTheme />
        </div>
      </div>
    </div>
  );
}
