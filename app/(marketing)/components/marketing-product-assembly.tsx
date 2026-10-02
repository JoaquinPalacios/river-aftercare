"use client";

import { MarketingRevealItem } from "@/app/(marketing)/components/marketing-reveal";
import { AFTERCARE_THEME_SCOPE } from "@/lib/branding/aftercare-theme";
import {
  MARKETING_DEMO_CLINIC_NAME,
  MARKETING_DEMO_GUIDE_TITLE,
  MARKETING_DEMO_INSTRUCTIONS_LABEL,
  MARKETING_DEMO_THEME_APPEARANCE,
} from "@/lib/marketing/demo-patient-preview";
import { delayedRevealItemVariants } from "@/lib/marketing/reveal-variants";

import styles from "../marketing.module.css";

export function MarketingProductAssembly() {
  return (
    <div
      className={styles.productCanvas}
      data-mk-product-canvas=""
      aria-hidden="true"
    >
      <div className={styles.productInputs}>
        <MarketingRevealItem
          delay={0.22}
          variants={delayedRevealItemVariants}
          className={styles.productRevealSlot}
        >
          <div className={styles.productFragment}>
            <p className={styles.productFragmentLabel}>Approved guide</p>
            <span className={styles.guideBar} />
            <span className={`${styles.guideBar} ${styles.guideBarMid}`} />
            <span className={`${styles.guideBar} ${styles.guideBarShort}`} />
          </div>
        </MarketingRevealItem>
        <MarketingRevealItem
          delay={0.28}
          variants={delayedRevealItemVariants}
          className={styles.productPlusSlot}
        >
          <span className={styles.productPlus}>+</span>
        </MarketingRevealItem>
        <MarketingRevealItem
          delay={0.29}
          variants={delayedRevealItemVariants}
          className={styles.productRevealSlot}
        >
          <div className={styles.productFragment}>
            <p className={styles.productFragmentLabel}>Clinic brand</p>
            <p className={styles.productClinicName} translate="no">
              {MARKETING_DEMO_CLINIC_NAME}
            </p>
            <div className={styles.productSwatchRow}>
              <span className={styles.productSwatchItem}>
                <span className={`${styles.swatch} ${styles.swatchTeal}`} />
                Primary
              </span>
              <span className={styles.productSwatchItem}>
                <span
                  className={`${styles.swatch} ${styles.swatchClinicAccent}`}
                />
                Accent
              </span>
            </div>
          </div>
        </MarketingRevealItem>
      </div>
      <MarketingRevealItem delay={0.36} variants={delayedRevealItemVariants}>
        <div className={styles.productMerge}>
          <span className={styles.productMergeLine} />
          <span className={styles.productMergeArrow} />
        </div>
      </MarketingRevealItem>
      <MarketingRevealItem
        delay={0.43}
        variants={delayedRevealItemVariants}
        className={styles.productResultSlot}
      >
        <div
          className={`${styles.productResult} ${AFTERCARE_THEME_SCOPE}`}
          data-patient-theme={MARKETING_DEMO_THEME_APPEARANCE}
        >
          <p className={styles.productResultClinic} translate="no">
            {MARKETING_DEMO_CLINIC_NAME}
          </p>
          <p className={styles.productResultTerm}>
            {MARKETING_DEMO_INSTRUCTIONS_LABEL}
          </p>
          <p className={styles.productResultGuide}>
            {MARKETING_DEMO_GUIDE_TITLE}
            <span className={styles.productResultArrow}>→</span>
          </p>
        </div>
      </MarketingRevealItem>
    </div>
  );
}
