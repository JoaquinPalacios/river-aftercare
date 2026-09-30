"use client";

import { useId } from "react";

export function TableSearch({
  label,
  placeholder,
  value,
  onValueChange,
  onClear,
}: {
  label: string;
  placeholder: string;
  value: string;
  onValueChange: (value: string) => void;
  onClear: () => void;
}) {
  const id = useId();
  return (
    <div className="staffTableSearch">
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="search"
        className="staffField"
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {value ? (
        <button
          type="button"
          className="staffTableSearchClear"
          aria-label="Clear search"
          onClick={onClear}
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
