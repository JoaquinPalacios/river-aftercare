"use client";

import { useEffect, useId, useRef } from "react";

import { SettingsIcon } from "@/app/(staff)/components/icons";
import {
  TABLE_PAGE_SIZES,
  type TableColumnDefinition,
  type TableDensity,
  type TablePageSize,
  type TablePresentationPreferences,
} from "@/lib/staff/table-controls";

export function TableSettings({
  columns,
  preferences,
  pageSize,
  lockedColumnMessage,
  onPageSizeChange,
  onWrapTextChange,
  onDensityChange,
  onColumnVisibilityChange,
  onReset,
}: {
  columns: readonly TableColumnDefinition[];
  preferences: TablePresentationPreferences;
  pageSize: TablePageSize;
  lockedColumnMessage: string;
  onPageSizeChange: (pageSize: TablePageSize) => void;
  onWrapTextChange: (wrapText: boolean) => void;
  onDensityChange: (density: TableDensity) => void;
  onColumnVisibilityChange: (columnId: string, visible: boolean) => void;
  onReset: () => void;
}) {
  const reactId = useId().replace(/:/g, "");
  const panelId = `table-settings-${reactId}`;
  const titleId = `table-settings-title-${reactId}`;
  const lockedId = `table-settings-locked-${reactId}`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function placePanel() {
    const panel = panelRef.current;
    const button = buttonRef.current;
    if (!panel || !button) {
      return;
    }
    const narrow = window.matchMedia("(max-width: 720px)").matches;
    if (narrow) {
      panel.dataset.placement = "sheet";
      panel.style.top = "auto";
      panel.style.left = "0.75rem";
      panel.style.right = "0.75rem";
      panel.style.bottom = "0.75rem";
      panel.style.width = "auto";
      return;
    }
    panel.dataset.placement = "popover";
    panel.style.bottom = "auto";
    panel.style.right = "auto";
    const width = 320;
    panel.style.width = `${width}px`;
    const rect = button.getBoundingClientRect();
    const left = Math.min(
      Math.max(8, rect.right - width),
      window.innerWidth - width - 8
    );
    const top = Math.min(rect.bottom + 6, window.innerHeight - 16);
    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
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
    const onResize = () => {
      if (panel.matches(":popover-open")) {
        placePanel();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="staffBtn staffBtnQuiet staffTableSettingsButton"
        popoverTarget={panelId}
        popoverTargetAction="toggle"
        aria-haspopup="dialog"
        aria-controls={panelId}
        aria-label="Table settings"
        title="Table settings"
      >
        <SettingsIcon />
      </button>
      <div
        ref={panelRef}
        id={panelId}
        popover="auto"
        role="dialog"
        aria-labelledby={titleId}
        className="staffTableSettings"
        onBeforeToggle={(event) => {
          if (event.newState === "open") {
            placePanel();
          }
        }}
        onToggle={(event) => {
          if (event.newState === "open") {
            placePanel();
            panelRef.current
              ?.querySelector<HTMLElement>("input, button")
              ?.focus();
          }
        }}
      >
        <div className="staffTableSettingsHeader">
          <h2 id={titleId} className="staffTableSettingsTitle">
            Table settings
          </h2>
        </div>
        <fieldset className="staffTableSettingsGroup">
          <legend>Rows</legend>
          <p className="staffTableSettingsLabel" id={`${panelId}-page-size`}>
            Rows per page
          </p>
          <div
            className="staffTableSettingsChoices"
            role="radiogroup"
            aria-labelledby={`${panelId}-page-size`}
          >
            {TABLE_PAGE_SIZES.map((size) => (
              <label key={size} className="staffTableSettingsChoice">
                <input
                  type="radio"
                  name={`${panelId}-page-size`}
                  value={size}
                  checked={pageSize === size}
                  onChange={() => onPageSizeChange(size)}
                />
                {size}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="staffTableSettingsGroup">
          <legend>Display</legend>
          <label className="staffTableSettingsCheck">
            <input
              type="checkbox"
              checked={preferences.wrapText}
              onChange={(event) => onWrapTextChange(event.target.checked)}
            />
            Wrap long text
          </label>
          <p className="staffTableSettingsLabel" id={`${panelId}-density`}>
            Row density
          </p>
          <div
            className="staffTableSettingsChoices"
            role="radiogroup"
            aria-labelledby={`${panelId}-density`}
          >
            {(["comfortable", "compact"] as const).map((density) => (
              <label key={density} className="staffTableSettingsChoice">
                <input
                  type="radio"
                  name={`${panelId}-density`}
                  value={density}
                  checked={preferences.density === density}
                  onChange={() => onDensityChange(density)}
                />
                {density === "comfortable" ? "Comfortable" : "Compact"}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="staffTableSettingsGroup">
          <legend>Columns</legend>
          <p className="staffTableSettingsHelp" id={lockedId}>
            {lockedColumnMessage}
          </p>
          <ul className="staffTableSettingsColumns">
            {columns.map((column) => {
              const visible =
                column.required ||
                !preferences.hiddenColumnIds.includes(column.id);
              return (
                <li key={column.id}>
                  <label className="staffTableSettingsCheck">
                    <input
                      type="checkbox"
                      checked={visible}
                      disabled={column.required}
                      aria-describedby={column.required ? lockedId : undefined}
                      onChange={(event) =>
                        onColumnVisibilityChange(
                          column.id,
                          event.target.checked
                        )
                      }
                    />
                    {column.label}
                    {column.required ? (
                      <span className="sr-only">, always shown</span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
        <div className="staffTableSettingsFooter">
          <button
            type="button"
            className="staffBtn staffBtnSecondary"
            onClick={onReset}
          >
            Reset to defaults
          </button>
        </div>
      </div>
    </>
  );
}
