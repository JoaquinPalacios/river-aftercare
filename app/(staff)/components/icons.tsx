export function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      className={className}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6.5 3.5h-3A1 1 0 0 0 2.5 4.5v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3" />
      <path d="M9.5 2.5h4v4M13.5 2.5 8 8" />
    </svg>
  );
}

export function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      className={className}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="8" r="1.7" />
      <path d="M6.4 1.9h3.2l.35 1.35c.4.12.78.32 1.12.56l1.28-.48 1.6 1.6-.48 1.28c.24.34.44.72.56 1.12l1.35.35v3.2l-1.35.35a3.6 3.6 0 0 1-.56 1.12l.48 1.28-1.6 1.6-1.28-.48a3.6 3.6 0 0 1-1.12.56L9.6 14.1H6.4l-.35-1.35a3.6 3.6 0 0 1-1.12-.56l-1.28.48-1.6-1.6.48-1.28a3.6 3.6 0 0 1-.56-1.12L.9 9.32v-3.2l1.35-.35c.12-.4.32-.78.56-1.12L2.33 3.37l1.6-1.6 1.28.48c.34-.24.72-.44 1.12-.56L6.4 1.9Z" />
    </svg>
  );
}

/** Right-pointing disclosure mark. Rotate 90° when the control is expanded. */
export function DisclosureChevron({
  className,
  direction = "right",
}: {
  className?: string;
  direction?: "right" | "down";
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      className={className}
      data-chevron={direction}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  );
}

export function PrinterIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      className={className}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.25 5.25V2.75h7.5v2.5" />
      <path d="M4.25 11.25H3.4A1.15 1.15 0 0 1 2.25 10.1V6.4A1.15 1.15 0 0 1 3.4 5.25h9.2a1.15 1.15 0 0 1 1.15 1.15v3.7a1.15 1.15 0 0 1-1.15 1.15h-.85" />
      <path d="M4.25 9.25h7.5V13.25h-7.5z" />
    </svg>
  );
}

export function BackArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      className={className}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.25 3.5 5.75 8l4.5 4.5" />
    </svg>
  );
}
