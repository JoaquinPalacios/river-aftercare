"use client";

import { useState, type ComponentProps } from "react";

import { TRY_AGAIN_LABEL, TRYING_AGAIN_LABEL } from "@/lib/errors/copy";

export function ErrorRetryButton({
  onRetry,
  idleLabel = TRY_AGAIN_LABEL,
  pendingLabel = TRYING_AGAIN_LABEL,
  className,
  disabled,
  ...props
}: {
  onRetry: () => void | Promise<void>;
  idleLabel?: string;
  pendingLabel?: string;
} & Omit<ComponentProps<"button">, "onClick" | "type" | "children">) {
  const [pending, setPending] = useState(false);

  return (
    <button
      {...props}
      type="button"
      className={className}
      disabled={pending || disabled}
      aria-busy={pending || undefined}
      onClick={() => {
        if (pending || disabled) {
          return;
        }

        setPending(true);
        void Promise.resolve(onRetry()).finally(() => {
          setPending(false);
        });
      }}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
