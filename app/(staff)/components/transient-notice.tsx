"use client";

import { useState, type ReactNode } from "react";

export type TransientNoticeVariant = "success" | "error" | "warning" | "info";

/**
 * Latest action feedback. Dismissal is local UI state and does not call the
 * server. A new `noticeKey` shows the notice again after a later action.
 */
export function TransientNotice({
  variant,
  children,
  noticeKey,
  dismissible = true,
  onDismiss,
}: {
  variant: TransientNoticeVariant;
  children: ReactNode;
  noticeKey?: string;
  dismissible?: boolean;
  onDismiss?: () => void;
}) {
  const key = noticeKey ?? (typeof children === "string" ? children : "notice");
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  if (dismissedKey === key) {
    return null;
  }

  return (
    <div
      className="staffTransientNotice"
      data-variant={variant}
      role={variant === "error" ? "alert" : "status"}
    >
      <div className="staffTransientNoticeBody">{children}</div>
      {dismissible ? (
        <button
          type="button"
          className="staffBtn staffBtnQuiet staffTransientNoticeDismiss"
          aria-label="Dismiss notification"
          onClick={() => {
            setDismissedKey(key);
            onDismiss?.();
          }}
        >
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
    </div>
  );
}
