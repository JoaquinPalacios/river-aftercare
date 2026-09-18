"use client";

import { LazyMotion, MotionConfig } from "motion/react";
import { type ReactNode } from "react";

import {
  MarketingRevealCard,
  MarketingRevealGroup,
  MarketingRevealHero,
  MarketingRevealItem,
  MarketingRevealPreview,
} from "@/app/(marketing)/components/marketing-reveal";

const loadFeatures = () =>
  import("./marketing-motion-features")
    .then((mod) => mod.default)
    .catch((error: unknown) => {
      document.documentElement.setAttribute("data-mk-motion", "reduce");
      throw error;
    });

export {
  MarketingRevealCard,
  MarketingRevealGroup,
  MarketingRevealHero,
  MarketingRevealItem,
  MarketingRevealPreview,
};

export function MarketingExperience({
  className,
  children,
  verticalId,
}: {
  className: string;
  children: ReactNode;
  verticalId?: string;
}) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">
        <div
          className={className}
          data-vertical={verticalId}
          data-brand-scope={verticalId ? "vertical" : "master"}
        >
          {children}
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
