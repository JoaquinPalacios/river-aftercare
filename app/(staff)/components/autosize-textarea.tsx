"use client";

import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

type AutosizeTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "rows"
>;

function fitTextarea(element: HTMLTextAreaElement) {
  const previousHeight = element.style.height;
  element.style.maxHeight = "none";
  element.style.overflowY = "hidden";
  element.style.height = "auto";
  const next = element.scrollHeight;
  element.style.maxHeight = "";
  element.style.overflowY = "";
  const nextHeight = `${next}px`;
  if (previousHeight !== nextHeight) {
    element.style.height = nextHeight;
  } else {
    element.style.height = previousHeight;
  }
}

export function AutosizeTextarea({
  value,
  defaultValue,
  onChange,
  className,
  ...props
}: AutosizeTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const controlled = value !== undefined;

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    fitTextarea(element);
    const panel = element.closest("[data-open]");
    if (!panel) {
      return;
    }
    const observer = new MutationObserver(() => {
      if (panel.getAttribute("data-open") === "true") {
        fitTextarea(element);
      }
    });
    observer.observe(panel, {
      attributes: true,
      attributeFilter: ["data-open"],
    });
    return () => observer.disconnect();
  }, [value, defaultValue]);

  return (
    <textarea
      {...props}
      ref={ref}
      rows={3}
      data-autosize=""
      {...(controlled ? { value } : { defaultValue })}
      className={["staffField", "staffAutosizeField", className]
        .filter(Boolean)
        .join(" ")}
      onChange={(event) => {
        fitTextarea(event.currentTarget);
        onChange?.(event);
      }}
    />
  );
}
