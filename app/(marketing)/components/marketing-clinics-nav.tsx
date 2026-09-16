"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import {
  CLINIC_VERTICAL_NAV,
  isClinicVerticalPath,
} from "@/lib/marketing/clinic-verticals";
import type { MarketingSeoPath } from "@/lib/seo/types";

import styles from "../marketing.module.css";

export function MarketingClinicsNav({
  currentPath,
}: {
  currentPath: MarketingSeoPath;
}) {
  const reactId = useId().replace(/:/g, "");
  const menuId = `mk-clinics-${reactId}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const current = isClinicVerticalPath(currentPath);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !containerRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.navClinics} ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.navClinicsTrigger} ${styles.textLink} ${
          current ? styles.navRoute : ""
        }`}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={menuId}
        aria-current={current ? "true" : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        For clinics
      </button>
      <ul id={menuId} hidden={!open} className={styles.navClinicsPanel}>
        {CLINIC_VERTICAL_NAV.map((item) => (
          <li key={item.path}>
            <Link
              className={styles.navClinicsLink}
              href={item.path}
              aria-current={currentPath === item.path ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {item.navLabel}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
