"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { StaffNavIcon } from "@/app/(staff)/components/staff-nav-icon";
import {
  applyThemePreference,
  parseThemePreference,
  PORTAL_THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/branding/theme-preference";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const FLYOUT_GAP_PX = 8;

export function PortalAppearanceControl() {
  const chooserId = useId().replace(/:/g, "");
  const menuId = `portal-theme-${chooserId}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [expanded, setExpanded] = useState(false);
  const [collapsedRail, setCollapsedRail] = useState(false);
  const [flyout, setFlyout] = useState<{ top: number; left: number } | null>(
    null
  );

  useEffect(() => {
    const stored = parseThemePreference(
      localStorage.getItem(PORTAL_THEME_STORAGE_KEY)
    );
    const fromDom = parseThemePreference(
      document.documentElement.getAttribute("data-theme-mode")
    );
    if (stored) {
      setPreference(stored);
      return;
    }
    if (fromDom) {
      setPreference(fromDom);
    }
  }, []);

  useEffect(() => {
    const sidebar = rootRef.current?.closest(".staffAppSidebar");
    if (!(sidebar instanceof HTMLElement)) {
      return;
    }
    const sync = () => {
      setCollapsedRail(sidebar.getAttribute("data-collapsed") === "true");
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(sidebar, {
      attributes: true,
      attributeFilter: ["data-collapsed"],
    });
    return () => observer.disconnect();
  }, []);

  const currentLabel =
    OPTIONS.find((option) => option.value === preference)?.label ?? "System";
  const portaled = collapsedRail && expanded;

  useLayoutEffect(() => {
    if (!portaled) {
      return;
    }
    const button = buttonRef.current;
    if (!button) {
      return;
    }

    function place() {
      const current = buttonRef.current;
      if (!current) {
        return;
      }
      const rect = current.getBoundingClientRect();
      const width = 160;
      const preferredLeft = rect.right + FLYOUT_GAP_PX;
      const maxLeft = Math.max(
        FLYOUT_GAP_PX,
        window.innerWidth - width - FLYOUT_GAP_PX
      );
      setFlyout({
        top: rect.top,
        left: Math.min(preferredLeft, maxLeft),
      });
    }

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [portaled]);

  useEffect(() => {
    if (!expanded) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setExpanded(false);
        buttonRef.current?.focus();
      }
    }

    function onPointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (buttonRef.current?.contains(target)) {
        return;
      }
      if (document.getElementById(menuId)?.contains(target)) {
        return;
      }
      setExpanded(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [expanded, menuId]);

  useEffect(() => {
    if (!portaled || !flyout) {
      return;
    }
    document
      .getElementById(menuId)
      ?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
      ?.focus();
  }, [portaled, flyout, menuId]);

  function selectPreference(next: ThemePreference) {
    setPreference(next);
    localStorage.setItem(PORTAL_THEME_STORAGE_KEY, next);
    setExpanded(false);
    buttonRef.current?.focus();
    void applyThemePreference(next, { productCookie: true });
  }

  const chooser = expanded ? (
    <div
      id={menuId}
      role="radiogroup"
      aria-label="Colour theme"
      className={portaled ? "ptlChooser ptlChooserFlyout" : "ptlChooser"}
      style={
        portaled && flyout ? { top: flyout.top, left: flyout.left } : undefined
      }
    >
      {OPTIONS.map((option) => {
        const selected = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className="ptlOption"
            onClick={() => selectPreference(option.value)}
          >
            <span>{option.label}</span>
            {selected ? <span aria-hidden="true">Selected</span> : null}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div className="ptl" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="ptlBtn"
        aria-expanded={expanded}
        aria-controls={menuId}
        aria-label={`Appearance, colour theme currently ${currentLabel}`}
        data-tooltip="Appearance"
        onClick={() => setExpanded((open) => !open)}
      >
        <StaffNavIcon name="appearance" />
        <span>Appearance</span>
        <span>{currentLabel}</span>
      </button>
      {portaled && chooser && typeof document !== "undefined"
        ? createPortal(chooser, document.body)
        : chooser}
    </div>
  );
}
