"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import {
  clinicDirectoryNavItems,
  isClinicAcquisitionPath,
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
  const current = isClinicAcquisitionPath(currentPath);
  const items = clinicDirectoryNavItems(currentPath);

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
      <div className={styles.navClinicsPanel} id={menuId} hidden={!open}>
        <p className={styles.navClinicsKicker} aria-hidden="true">
          For clinics
        </p>
        <ul className={styles.navClinicsList}>
          {items.map((item, index) => (
            <li
              key={item.href}
              className={
                index === 0 ? styles.navClinicsOverview : styles.navClinicsItem
              }
            >
              <Link
                className={styles.navClinicsLink}
                href={item.href}
                aria-current={item.current ? "page" : undefined}
                data-vertical={item.themeId}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
