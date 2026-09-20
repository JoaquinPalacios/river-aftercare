"use client";

import { useState } from "react";

import { MarketingPrimaryButton } from "@/app/(marketing)/components/marketing-primary-button";
import { TRY_AGAIN_LABEL, TRYING_AGAIN_LABEL } from "@/lib/errors/copy";

export function MarketingErrorRetry({
  onRetry,
}: {
  onRetry: () => void | Promise<void>;
}) {
  const [pending, setPending] = useState(false);

  return (
    <MarketingPrimaryButton
      type="button"
      busy={pending}
      busyLabel={TRYING_AGAIN_LABEL}
      onClick={() => {
        if (pending) {
          return;
        }

        setPending(true);
        void Promise.resolve(onRetry()).finally(() => {
          setPending(false);
        });
      }}
    >
      {TRY_AGAIN_LABEL}
    </MarketingPrimaryButton>
  );
}
