"use client";

import { useEffect, useId, useRef, useState } from "react";

import {
  applyThemePreference,
  parseThemePreference,
  type ThemePreference,
} from "@/lib/branding/theme-preference";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function AppearanceMenu({
  storageKey,
  classPrefix,
  shareProductCookie = false,
}: {
  storageKey: string;
  classPrefix: string;
  shareProductCookie?: boolean;
}) {
  const reactId = useId().replace(/:/g, "");
  const menuId = `${classPrefix}-menu-${reactId}`;
  const menuRef = useRef<HTMLDivElement>(null);
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const stored = parseThemePreference(localStorage.getItem(storageKey));
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
  }, [storageKey]);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) {
      return;
    }

    const sync = () => setOpen(menu.matches(":popover-open"));
    menu.addEventListener("toggle", sync);
    return () => menu.removeEventListener("toggle", sync);
  }, []);

  const currentLabel =
    OPTIONS.find((option) => option.value === preference)?.label ?? "System";

  return (
    <div className={classPrefix}>
      <button
        type="button"
        className={`${classPrefix}Btn`}
        popoverTarget={menuId}
        popoverTargetAction="toggle"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Change colour theme (currently ${currentLabel})`}
        title="Change colour theme"
      >
        <AppearanceGlyph preference={preference} />
      </button>
      <div
        ref={menuRef}
        id={menuId}
        popover="auto"
        role="menu"
        aria-label="Colour theme"
        className={`${classPrefix}Menu`}
      >
        {OPTIONS.map((option) => {
          const selected = preference === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={selected}
              className={`${classPrefix}Option`}
              style={{ alignItems: "center", gap: "0.5rem" }}
              onClick={() => {
                setPreference(option.value);
                applyThemePreference(option.value, {
                  productCookie: shareProductCookie,
                });
                localStorage.setItem(storageKey, option.value);
                menuRef.current?.hidePopover();
              }}
            >
              <span className={`${classPrefix}OptionIcon`} aria-hidden="true">
                <AppearanceGlyph preference={option.value} />
              </span>
              <span className={`${classPrefix}OptionLabel`}>
                {option.label}
              </span>
              {selected ? (
                <span
                  className={`${classPrefix}Check`}
                  style={{ marginLeft: "auto" }}
                  aria-hidden="true"
                >
                  <CheckGlyph />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AppearanceGlyph({ preference }: { preference: ThemePreference }) {
  if (preference === "light") {
    return (
      <svg
        viewBox="0 0 16 16"
        width="14"
        height="14"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="8" cy="8" r="3" fill="currentColor" />
        <path
          d="M8 1.25v1.5M8 13.25v1.5M1.25 8h1.5M13.25 8h1.5M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (preference === "dark") {
    return (
      <svg
        viewBox="0 0 16 16"
        width="14"
        height="14"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M13.2 10.1A5.6 5.6 0 1 1 5.9 2.8 4.6 4.6 0 1 0 13.2 10.1Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="8"
        cy="8"
        r="5.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path d="M8 2.75A5.25 5.25 0 0 1 8 13.25V2.75Z" fill="currentColor" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3.2 8.4 6.3 11.4 12.8 4.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
