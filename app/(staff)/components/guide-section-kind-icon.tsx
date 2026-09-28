import type { ReactNode } from "react";

import type { GuideSectionKind } from "@/lib/aftercare/types";

function IconFrame({
  kind,
  children,
}: {
  kind: GuideSectionKind;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      data-section-icon={kind}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function GuideSectionKindIcon({ kind }: { kind: GuideSectionKind }) {
  switch (kind) {
    case "INTRODUCTION":
    case "CUSTOM":
      return (
        <IconFrame kind={kind}>
          <path d="M4.25 2.75h4.6L12 6.05V13a.75.75 0 0 1-.75.75h-7A.75.75 0 0 1 3.5 13V3.5a.75.75 0 0 1 .75-.75Z" />
          <path d="M8.75 2.75V6h3.15" />
        </IconFrame>
      );
    case "IMMEDIATE_CARE":
      return (
        <IconFrame kind={kind}>
          <circle cx="8" cy="8" r="5.25" />
          <path d="M8 5.4v5.2M5.4 8h5.2" />
        </IconFrame>
      );
    case "FIRST_24_HOURS":
      return (
        <IconFrame kind={kind}>
          <circle cx="8" cy="8" r="5.25" />
          <path d="M8 5.1V8l2.1 1.35" />
        </IconFrame>
      );
    case "RECOVERY_TIMELINE":
      return (
        <IconFrame kind={kind}>
          <rect x="2.75" y="3.25" width="10.5" height="10" rx="1.25" />
          <path d="M2.75 6.25h10.5M5.5 2.5v2.25M10.5 2.5v2.25" />
        </IconFrame>
      );
    case "WHAT_IS_NORMAL":
      return (
        <IconFrame kind={kind}>
          <circle cx="8" cy="8" r="5.25" />
          <path d="M5.55 8.15 7.15 9.7l3.3-3.35" />
        </IconFrame>
      );
    case "PAIN":
      return (
        <IconFrame kind={kind}>
          <circle cx="8" cy="8" r="5.25" />
          <circle cx="8" cy="8" r="1.15" fill="currentColor" stroke="none" />
        </IconFrame>
      );
    case "RESTRICTIONS":
      return (
        <IconFrame kind={kind}>
          <circle cx="8" cy="8" r="5.25" />
          <path d="M5.4 8h5.2" />
        </IconFrame>
      );
    case "MEDICATIONS":
      return (
        <IconFrame kind={kind}>
          <path d="M6.05 9.95 9.95 6.05a2.15 2.15 0 0 1 3.05 3.05l-3.9 3.9a2.15 2.15 0 0 1-3.05-3.05Z" />
          <path d="M7.7 8.3h.6" />
        </IconFrame>
      );
    case "SITE_CARE":
      return (
        <IconFrame kind={kind}>
          <path d="M8 12.35S3.9 9.85 3.9 7.15A2.05 2.05 0 0 1 8 6.05a2.05 2.05 0 0 1 4.1 1.1c0 2.7-4.1 5.2-4.1 5.2Z" />
        </IconFrame>
      );
    case "WHAT_TO_AVOID":
      return (
        <IconFrame kind={kind}>
          <circle cx="8" cy="8" r="5.25" />
          <path d="M4.7 4.7 11.3 11.3" />
        </IconFrame>
      );
    case "WARNING_SIGNS":
      return (
        <IconFrame kind={kind}>
          <path d="M8 2.7 13.7 13.15H2.3L8 2.7Z" />
          <path d="M8 6.55v2.9" />
          <circle
            cx="8"
            cy="11.15"
            r="0.45"
            fill="currentColor"
            stroke="none"
          />
        </IconFrame>
      );
    case "CONTACT_PRACTICE":
      return (
        <IconFrame kind={kind}>
          <path d="M4.4 3.55h1.85l.9 2.05-1.05.65a5.4 5.4 0 0 0 2.7 2.7l.65-1.05 2.05.9v1.85a.85.85 0 0 1-.85.85A7.35 7.35 0 0 1 3.55 4.4a.85.85 0 0 1 .85-.85Z" />
        </IconFrame>
      );
    case "EMERGENCY":
      return (
        <IconFrame kind={kind}>
          <circle cx="8" cy="8" r="5.25" />
          <path d="M8 5.15v3.35" />
          <circle
            cx="8"
            cy="10.85"
            r="0.45"
            fill="currentColor"
            stroke="none"
          />
        </IconFrame>
      );
    case "HOME_CARE_PLAN":
      return (
        <IconFrame kind={kind}>
          <rect x="3" y="2.75" width="10" height="10.5" rx="1.25" />
          <path d="M5.35 7.15 6.85 8.6 10.65 5.2" />
          <path d="M5.5 11h5" />
        </IconFrame>
      );
  }
}
