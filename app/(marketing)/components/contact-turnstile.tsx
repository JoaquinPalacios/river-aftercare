"use client";

import { useEffect, useRef } from "react";

import {
  CONTACT_TURNSTILE_FIELD,
  TURNSTILE_DUMMY_PASS_TOKEN,
  TURNSTILE_SCRIPT_SRC,
  isDummyPassTurnstileSiteKey,
} from "@/lib/marketing/contact-turnstile-public";

import styles from "../marketing.module.css";

type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      theme?: "auto" | "light" | "dark";
      size?: "normal" | "compact" | "flexible";
      appearance?: "always" | "execute" | "interaction-only";
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      "response-field"?: boolean;
      "response-field-name"?: string;
    }
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstileApi(): Promise<TurnstileApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("no-window"));
  }

  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }

  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-river-turnstile="true"]'
    );
    const onReady = () => {
      if (window.turnstile) {
        resolve(window.turnstile);
        return;
      }
      reject(new Error("missing-api"));
    };

    if (existing) {
      existing.addEventListener("load", onReady, { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("script-error")),
        { once: true }
      );
      if (window.turnstile) {
        resolve(window.turnstile);
      }
      return;
    }

    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.dataset.riverTurnstile = "true";
    script.addEventListener("load", onReady, { once: true });
    script.addEventListener("error", () => reject(new Error("script-error")), {
      once: true,
    });
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export function ContactTurnstile({
  siteKey,
  resetSignal,
}: {
  siteKey: string;
  resetSignal: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!siteKey || isDummyPassTurnstileSiteKey(siteKey)) {
      return;
    }

    let cancelled = false;
    let widgetId: string | null = null;
    let api: TurnstileApi | null = null;

    loadTurnstileApi()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) {
          return;
        }
        api = turnstile;
        widgetId = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: "auto",
          size: "flexible",
          appearance: "always",
          "response-field": true,
          "response-field-name": CONTACT_TURNSTILE_FIELD,
        });
      })
      .catch(() => {
        scriptPromise = null;
      });

    return () => {
      cancelled = true;
      if (widgetId && api) {
        api.remove(widgetId);
      }
    };
  }, [siteKey, resetSignal]);

  if (!siteKey) {
    return null;
  }

  if (isDummyPassTurnstileSiteKey(siteKey)) {
    return (
      <div
        className={styles.contactTurnstile}
        role="group"
        aria-label="Verification"
      >
        <input
          type="hidden"
          name={CONTACT_TURNSTILE_FIELD}
          value={TURNSTILE_DUMMY_PASS_TOKEN}
        />
      </div>
    );
  }

  return (
    <div
      className={styles.contactTurnstile}
      role="group"
      aria-label="Verification"
    >
      <div ref={containerRef} className={styles.contactTurnstileWidget} />
    </div>
  );
}
