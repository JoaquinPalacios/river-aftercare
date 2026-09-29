"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const TOOLTIP_GAP_PX = 8;
const VIEWPORT_GUTTER_PX = 8;

type TooltipPlacement = {
  label: string;
  top: number;
  left: number;
};

function collapsedTooltipTrigger(
  target: EventTarget | null
): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const trigger = target.closest("[data-tooltip]");
  if (!(trigger instanceof HTMLElement)) {
    return null;
  }
  const sidebar = trigger.closest(".staffAppSidebar");
  if (!(sidebar instanceof HTMLElement)) {
    return null;
  }
  if (sidebar.getAttribute("data-collapsed") !== "true") {
    return null;
  }
  return trigger;
}

function placeTooltip(trigger: HTMLElement): TooltipPlacement | null {
  const label = trigger.getAttribute("data-tooltip")?.trim();
  if (!label) {
    return null;
  }
  const rect = trigger.getBoundingClientRect();
  return {
    label,
    top: rect.top + rect.height / 2,
    left: rect.right + TOOLTIP_GAP_PX,
  };
}

export function StaffSidebarTooltip({ enabled }: { enabled: boolean }) {
  const [tooltip, setTooltip] = useState<TooltipPlacement | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) {
      setTooltip(null);
      return;
    }

    function show(trigger: HTMLElement) {
      setTooltip(placeTooltip(trigger));
    }

    function hideUnlessInside(trigger: HTMLElement, next: EventTarget | null) {
      if (
        next instanceof Node &&
        (next === trigger || trigger.contains(next))
      ) {
        return;
      }
      setTooltip(null);
    }

    function onMouseOver(event: MouseEvent) {
      const trigger = collapsedTooltipTrigger(event.target);
      if (!trigger) {
        return;
      }
      show(trigger);
    }

    function onMouseOut(event: MouseEvent) {
      const trigger = collapsedTooltipTrigger(event.target);
      if (!trigger) {
        return;
      }
      hideUnlessInside(trigger, event.relatedTarget);
    }

    function onFocusIn(event: FocusEvent) {
      const trigger = collapsedTooltipTrigger(event.target);
      if (!trigger) {
        return;
      }
      show(trigger);
    }

    function onFocusOut(event: FocusEvent) {
      const trigger = collapsedTooltipTrigger(event.target);
      if (!trigger) {
        return;
      }
      hideUnlessInside(trigger, event.relatedTarget);
    }

    function hide() {
      setTooltip(null);
    }

    document.addEventListener("mouseover", onMouseOver);
    document.addEventListener("mouseout", onMouseOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("mouseout", onMouseOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [enabled]);

  useLayoutEffect(() => {
    if (!enabled) {
      return;
    }
    const element = tooltipRef.current;
    if (!element) {
      return;
    }
    const box = element.getBoundingClientRect();
    const overflow = box.right - (window.innerWidth - VIEWPORT_GUTTER_PX);
    if (overflow > 0) {
      element.style.left = `${Math.max(
        VIEWPORT_GUTTER_PX,
        box.left - overflow
      )}px`;
    }
  }, [enabled, tooltip]);

  if (!enabled || !tooltip || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      ref={tooltipRef}
      className="staffSidebarTooltip"
      role="tooltip"
      style={{ top: tooltip.top, left: tooltip.left }}
    >
      {tooltip.label}
    </div>,
    document.body
  );
}
