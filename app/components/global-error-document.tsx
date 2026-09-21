"use client";

import { PRODUCT_ISOLOGO_SRC } from "@/lib/branding/product-assets";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { ErrorRetryButton } from "@/app/components/error-retry-button";
import { ClientErrorReporter } from "@/lib/observability/client-error-reporter";
import {
  GLOBAL_ERROR_BODY,
  GLOBAL_ERROR_TITLE,
  TRY_AGAIN_LABEL,
  TRYING_AGAIN_LABEL,
} from "@/lib/errors/copy";
import {
  errorRecoveryAction,
  type AppRouterErrorProps,
} from "@/lib/errors/app-router-error";

const GLOBAL_ERROR_STYLES = `
html { height: 100%; }
body {
  margin: 0;
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem 1.25rem;
  background: #f4f5f8;
  color: #0a0d14;
  font-family: ui-sans-serif, system-ui, sans-serif;
  line-height: 1.5;
}
main { width: 100%; max-width: 28rem; }
.brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 1rem;
  font-size: 0.875rem;
  font-weight: 650;
  color: #3b4bd1;
}
.brand img { width: 1.25rem; height: 1.25rem; }
h1 { margin: 0 0 0.5rem; font-size: 1.5rem; letter-spacing: -0.03em; }
p.copy { margin: 0 0 1.25rem; color: #5c6573; }
button {
  appearance: none;
  min-height: 2.5rem;
  padding: 0 1rem;
  border: 0;
  border-radius: 0.375rem;
  background: #3b4bd1;
  color: #fff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
button:focus-visible {
  outline: 2px solid #3b4bd1;
  outline-offset: 3px;
}
button:disabled { cursor: wait; opacity: 0.72; }
@media (prefers-reduced-motion: reduce) {
  button { transition: none; }
}
@media (prefers-color-scheme: dark) {
  body { background: #0c0e14; color: #f3f4f8; }
  .brand { color: #8ea0ff; }
  p.copy { color: #a8b2c2; }
  button { background: #3b4bd1; color: #fff; }
  button:focus-visible { outline-color: #8ea0ff; }
}
`;

export function GlobalErrorDocument(props: AppRouterErrorProps) {
  const recover =
    errorRecoveryAction(props) ??
    (() => {
      window.location.reload();
    });

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>{GLOBAL_ERROR_TITLE}</title>
        <style>{GLOBAL_ERROR_STYLES}</style>
      </head>
      <body>
        <ClientErrorReporter error={props.error} />
        <main>
          <p className="brand">
            {/* Local static brand file; global-error cannot rely on root CSS or next/image. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={PRODUCT_ISOLOGO_SRC} alt="" width={32} height={32} />
            {PRODUCT_NAME}
          </p>
          <h1>{GLOBAL_ERROR_TITLE}</h1>
          <p className="copy">{GLOBAL_ERROR_BODY}</p>
          <ErrorRetryButton
            onRetry={recover}
            idleLabel={TRY_AGAIN_LABEL}
            pendingLabel={TRYING_AGAIN_LABEL}
          />
        </main>
      </body>
    </html>
  );
}
