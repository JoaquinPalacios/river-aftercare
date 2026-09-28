"use client";

function Chevron({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {direction === "up" ? (
        <path d="M3.5 10 8 5.5 12.5 10" />
      ) : (
        <path d="M3.5 6 8 10.5 12.5 6" />
      )}
    </svg>
  );
}

export function SectionOrderControls({
  label,
  index,
  count,
  onMove,
  onRemove,
  removeLabel = "Remove",
}: {
  label: string;
  index: number;
  count: number;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  removeLabel?: string;
}) {
  return (
    <div
      className="staffSectionOrder"
      role="group"
      aria-label={`Reorder ${label}`}
    >
      <button
        type="button"
        className="staffBtn staffBtnQuiet"
        aria-label={`Move ${label} up`}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        <Chevron direction="up" />
        Up
      </button>
      <button
        type="button"
        className="staffBtn staffBtnQuiet"
        aria-label={`Move ${label} down`}
        disabled={index >= count - 1}
        onClick={() => onMove(1)}
      >
        <Chevron direction="down" />
        Down
      </button>
      <button
        type="button"
        className="staffBtn staffBtnDanger"
        aria-label={`${removeLabel} ${label}`}
        onClick={onRemove}
      >
        {removeLabel}
      </button>
    </div>
  );
}
