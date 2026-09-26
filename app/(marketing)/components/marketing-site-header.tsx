"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";

import { MarketingClinicsNav } from "@/app/(marketing)/components/marketing-clinics-nav";
import { MarketingNavMenu } from "@/app/(marketing)/components/marketing-nav-menu";
import type { MarketingMenuItem } from "@/app/(marketing)/components/marketing-nav-menu";
import { MarketingThemeControl } from "@/app/(marketing)/components/marketing-theme-control";
import { ProductLogo } from "@/lib/branding/product-logo";
import { ProductMark } from "@/lib/branding/product-mark";
import { PRODUCT_NAME } from "@/lib/branding/product-name";
import { isMarketingMotionEnabled } from "@/lib/marketing/marketing-motion-enabled";
import { nextMarketingNavVisibility } from "@/lib/marketing/nav-scroll";
import { REVEAL_EASE } from "@/lib/marketing/reveal-timing";
import type { MarketingSeoPath } from "@/lib/seo/types";

import styles from "../marketing.module.css";

const SIGN_IN_LABEL = "Sign in";

export function MarketingSiteHeader({
  currentPath,
  staffHref,
  menuItems,
  clinicItems,
}: {
  currentPath: MarketingSeoPath;
  staffHref: string;
  menuItems: MarketingMenuItem[];
  clinicItems: MarketingMenuItem[];
}) {
  const reducedMotion = useReducedMotion();
  const [clientReady, setClientReady] = useState(false);
  const [hidden, setHidden] = useState(false);
  const motionOn = isMarketingMotionEnabled(clientReady, reducedMotion);
  const hiddenRef = useRef(false);
  const anchorRef = useRef(0);
  const mobileOpenRef = useRef(false);
  const clinicsOpenRef = useRef(false);

  const reveal = useCallback(() => {
    anchorRef.current = window.scrollY;
    if (!hiddenRef.current) {
      return;
    }
    hiddenRef.current = false;
    setHidden(false);
  }, []);

  const syncMenu = useCallback(
    (source: "mobile" | "clinics", open: boolean) => {
      if (source === "mobile") {
        mobileOpenRef.current = open;
      } else {
        clinicsOpenRef.current = open;
      }
      if (mobileOpenRef.current || clinicsOpenRef.current) {
        reveal();
      }
    },
    [reveal]
  );

  const onMobileOpenChange = useCallback(
    (open: boolean) => syncMenu("mobile", open),
    [syncMenu]
  );
  const onClinicsOpenChange = useCallback(
    (open: boolean) => syncMenu("clinics", open),
    [syncMenu]
  );

  useEffect(() => {
    setClientReady(true);
  }, []);

  useEffect(() => {
    anchorRef.current = window.scrollY;
    let frame = 0;

    const onScroll = () => {
      if (frame) {
        return;
      }
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const next = nextMarketingNavVisibility({
          hidden: hiddenRef.current,
          scrollY: window.scrollY,
          anchorY: anchorRef.current,
          menuOpen: mobileOpenRef.current || clinicsOpenRef.current,
        });
        anchorRef.current = next.anchorY;
        if (next.hidden !== hiddenRef.current) {
          hiddenRef.current = next.hidden;
          setHidden(next.hidden);
        }
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, []);

  return (
    <m.header
      className={`${styles.top} ${styles.marketingBase}`}
      data-nav-hidden={hidden ? "true" : "false"}
      initial={false}
      animate={{ y: hidden ? "-100%" : "0%" }}
      transition={
        motionOn ? { duration: 0.22, ease: REVEAL_EASE } : { duration: 0 }
      }
      onFocusCapture={reveal}
    >
      <div className={styles.topInner}>
        <Link className={styles.wordmark} href="/" aria-label={PRODUCT_NAME}>
          <ProductLogo className={styles.logo} />
          <span className={styles.wordmarkName}>
            <ProductMark className={styles.mark} />
            {PRODUCT_NAME}
          </span>
        </Link>
        <nav className={styles.nav} aria-label="Marketing">
          <MarketingClinicsNav
            currentPath={currentPath}
            onOpenChange={onClinicsOpenChange}
          />
          {menuItems.map((item) => (
            <Link
              key={item.href}
              className={`${styles.navRoute} ${styles.textLink}`}
              href={item.href}
              aria-current={item.current ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
          <a
            className={`${styles.navStaff} ${styles.textLink}`}
            href={staffHref}
          >
            {SIGN_IN_LABEL}
          </a>
          <span className={styles.navTheme}>
            <MarketingThemeControl />
          </span>
          <MarketingNavMenu
            items={menuItems}
            clinicItems={clinicItems}
            staffHref={staffHref}
            onOpenChange={onMobileOpenChange}
          />
        </nav>
      </div>
    </m.header>
  );
}
