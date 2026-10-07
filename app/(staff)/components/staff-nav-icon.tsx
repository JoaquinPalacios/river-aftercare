export type StaffNavIconName =
  | "overview"
  | "guides"
  | "practice"
  | "sites"
  | "patient"
  | "clinics"
  | "templates"
  | "seo"
  | "account"
  | "billing"
  | "help"
  | "sign-out"
  | "appearance"
  | "collapse"
  | "expand";

export function StaffNavIcon({ name }: { name: StaffNavIconName }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      className="staffNavIcon"
      data-nav-icon={name}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {iconPath(name)}
    </svg>
  );
}

function iconPath(name: StaffNavIconName) {
  switch (name) {
    case "overview":
      return (
        <>
          <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="0.75" />
          <rect x="9" y="2.5" width="4.5" height="4.5" rx="0.75" />
          <rect x="2.5" y="9" width="4.5" height="4.5" rx="0.75" />
          <rect x="9" y="9" width="4.5" height="4.5" rx="0.75" />
        </>
      );
    case "guides":
      return (
        <>
          <path d="M4.25 2.75h4.6L12 6.05V13a.75.75 0 0 1-.75.75h-7A.75.75 0 0 1 3.5 13V3.5a.75.75 0 0 1 .75-.75Z" />
          <path d="M8.75 2.75V6h3.15M5.4 9h5.2M5.4 11.2h3.4" />
        </>
      );
    case "practice":
      return (
        <>
          <path d="M3 6.5 8 3.2 13 6.5" />
          <path d="M4.2 6.2V13h7.6V6.2" />
          <path d="M6.8 13V9.2h2.4V13" />
        </>
      );
    case "sites":
      return (
        <>
          <path d="M8 13.2s4.2-3.7 4.2-6.35A4.2 4.2 0 0 0 8 2.7a4.2 4.2 0 0 0-4.2 4.15C3.8 9.5 8 13.2 8 13.2Z" />
          <circle cx="8" cy="6.85" r="1.2" />
        </>
      );
    case "patient":
      return (
        <>
          <circle cx="8" cy="5.2" r="2" />
          <path d="M4.2 12.4c.5-1.8 2-2.7 3.8-2.7s3.3.9 3.8 2.7" />
        </>
      );
    case "clinics":
      return (
        <>
          <path d="M6.67 8h2.67" />
          <path d="M6.67 5.33h2.67" />
          <path d="M9.33 14v-2a1.33 1.33 0 0 0-2.67 0v2" />
          <path d="M4 6.67H2.67a1.33 1.33 0 0 0-1.33 1.33v4.67a1.33 1.33 0 0 0 1.33 1.33h10.67a1.33 1.33 0 0 0 1.33-1.33V6a1.33 1.33 0 0 0-1.33-1.33h-1.33" />
          <path d="M4 14V3.33a1.33 1.33 0 0 1 1.33-1.33h5.33a1.33 1.33 0 0 1 1.33 1.33V14" />
        </>
      );
    case "templates":
      return (
        <>
          <rect x="3.2" y="2.6" width="9.6" height="10.8" rx="1.2" />
          <path d="M5.4 5.6h5.2M5.4 8h5.2M5.4 10.4h3.2" />
        </>
      );
    case "seo":
      return (
        <>
          <circle cx="7" cy="7" r="3.4" />
          <path d="M9.5 9.5 13 13" />
        </>
      );
    case "account":
      return (
        <>
          <circle cx="8" cy="5.4" r="2.1" />
          <path d="M3.8 12.6c.6-2 2.2-3 4.2-3s3.6 1 4.2 3" />
        </>
      );
    case "billing":
      return (
        <>
          <rect x="2.4" y="4" width="11.2" height="8" rx="1.2" />
          <path d="M2.4 7h11.2" />
        </>
      );
    case "help":
      return (
        <>
          <circle cx="8" cy="8" r="5.25" />
          <path d="M6.4 6.3a1.6 1.6 0 0 1 3.1.6c0 1-1.5 1.2-1.5 2.2" />
          <path d="M8 11.4h.01" />
        </>
      );
    case "sign-out":
      return (
        <>
          <path d="M6.5 3.2H4.2A1.2 1.2 0 0 0 3 4.4v7.2a1.2 1.2 0 0 0 1.2 1.2h2.3" />
          <path d="M7 8h6.2M11 5.6 13.4 8 11 10.4" />
        </>
      );
    case "appearance":
      return (
        <>
          <circle cx="8" cy="8" r="2.1" />
          <path d="M8 2.6v1.4M8 12v1.4M2.6 8h1.4M12 8h1.4M4.2 4.2l1 1M10.8 10.8l1 1M11.8 4.2l-1 1M5.2 10.8l-1 1" />
        </>
      );
    case "collapse":
      return (
        <>
          <rect x="2.4" y="3" width="11.2" height="10" rx="1.2" />
          <path d="M6.2 3v10M9.2 6.2 7.4 8l1.8 1.8" />
        </>
      );
    case "expand":
      return (
        <>
          <rect x="2.4" y="3" width="11.2" height="10" rx="1.2" />
          <path d="M6.2 3v10M8.2 6.2 10 8 8.2 9.8" />
        </>
      );
  }
}
