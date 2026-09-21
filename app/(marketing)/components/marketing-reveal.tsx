"use client";

import {
  useInView,
  useReducedMotion,
  type UseInViewOptions,
} from "motion/react";
import * as m from "motion/react-m";
import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { MARKETING_SSR_VIEWPORT_WIDTH_PX } from "@/lib/marketing/breakpoints";
import { isMarketingMotionEnabled } from "@/lib/marketing/marketing-motion-enabled";
import { marketingRevealMargin } from "@/lib/marketing/reveal-margin";
import {
  cardRevealDelay,
  cardRevealItemVariants,
  delayedRevealItemVariants,
  HERO_PREVIEW_VARIANTS,
  HERO_VIEWPORT,
  heroContainerVariants,
  MARKETING_REVEAL_VIEWPORT,
  nodeRevealItemVariants,
  previewRevealVariants,
  railRevealVariants,
  revealContainerVariants,
  revealItemVariants,
} from "@/lib/marketing/reveal-variants";

type RevealViewport = typeof MARKETING_REVEAL_VIEWPORT | typeof HERO_VIEWPORT;
type RevealVariants =
  | typeof delayedRevealItemVariants
  | typeof revealItemVariants
  | typeof HERO_PREVIEW_VARIANTS
  | typeof previewRevealVariants
  | typeof railRevealVariants
  | typeof cardRevealItemVariants
  | typeof nodeRevealItemVariants;

const MotionTag = {
  div: m.div,
  li: m.li,
  span: m.span,
} as const;

function subscribeViewportWidth(onStoreChange: () => void) {
  window.addEventListener("resize", onStoreChange);
  return () => window.removeEventListener("resize", onStoreChange);
}

function readViewportWidth() {
  return window.innerWidth;
}

function useMarketingRevealViewport(): Pick<
  UseInViewOptions,
  "once" | "margin"
> {
  const width = useSyncExternalStore(
    subscribeViewportWidth,
    readViewportWidth,
    () => MARKETING_SSR_VIEWPORT_WIDTH_PX
  );
  const margin = marketingRevealMargin(width) as NonNullable<
    UseInViewOptions["margin"]
  >;

  return useMemo(
    () => ({
      once: true,
      margin,
    }),
    [margin]
  );
}

function useClientReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  return ready;
}

function useMarketingMotionOn(): boolean {
  const clientReady = useClientReady();
  const reduced = useReducedMotion();
  return isMarketingMotionEnabled(clientReady, reduced);
}

function clearPending(node: HTMLElement | null, definition: unknown) {
  if (definition === "visible") {
    node?.removeAttribute("data-mk-pending");
  }
}

export function MarketingRevealGroup({
  children,
  viewport = MARKETING_REVEAL_VIEWPORT,
  variants = revealContainerVariants,
}: {
  children: ReactNode;
  viewport?: RevealViewport;
  variants?: typeof revealContainerVariants | typeof heroContainerVariants;
}) {
  const motionOn = useMarketingMotionOn();
  const ref = useRef<HTMLDivElement>(null);
  const revealViewport = useMarketingRevealViewport();
  const inView = useInView(ref, revealViewport);

  return (
    <m.div
      ref={ref}
      data-mk-section=""
      data-mk-entered={inView ? "" : undefined}
      initial={motionOn ? "hidden" : false}
      animate={motionOn ? (inView ? "visible" : "hidden") : false}
      variants={variants}
    >
      {children}
    </m.div>
  );
}

export function MarketingRevealItem({
  children,
  delay,
  variants,
  as = "div",
  className,
  rail = false,
  preview = false,
  connector = false,
  ariaHidden = false,
}: {
  children: ReactNode;
  delay?: number;
  variants?: RevealVariants;
  as?: keyof typeof MotionTag;
  className?: string;
  rail?: boolean;
  preview?: boolean;
  connector?: boolean;
  ariaHidden?: boolean;
}) {
  const nodeRef = useRef<HTMLElement | null>(null);
  const Tag = MotionTag[as];
  const useDelay = delay !== undefined;
  const resolvedVariants =
    variants ??
    (preview
      ? previewRevealVariants
      : useDelay
        ? delayedRevealItemVariants
        : revealItemVariants);
  const classes = ["mkReveal", className].filter(Boolean).join(" ");

  return (
    <Tag
      ref={(node: HTMLElement | null) => {
        nodeRef.current = node;
      }}
      className={classes}
      data-mk-pending=""
      data-mk-rail={rail ? "" : undefined}
      data-mk-process-rail={rail ? "" : undefined}
      data-mk-preview={preview ? "" : undefined}
      data-mk-process-connector={connector ? "" : undefined}
      aria-hidden={rail || connector || ariaHidden ? true : undefined}
      custom={delay ?? 0}
      variants={resolvedVariants}
      onAnimationComplete={(definition) => {
        clearPending(nodeRef.current, definition);
      }}
    >
      {children}
    </Tag>
  );
}

export function MarketingRevealCard({
  children,
  index = 0,
  variants = cardRevealItemVariants,
  as = "div",
  className,
  rail = false,
  connector = false,
  processCard = false,
  ariaHidden = false,
}: {
  children: ReactNode;
  index?: number;
  variants?: RevealVariants;
  as?: keyof typeof MotionTag;
  className?: string;
  rail?: boolean;
  connector?: boolean;
  processCard?: boolean;
  ariaHidden?: boolean;
}) {
  const motionOn = useMarketingMotionOn();
  const ref = useRef<HTMLElement | null>(null);
  const revealViewport = useMarketingRevealViewport();
  const inView = useInView(ref, revealViewport);
  const Tag = MotionTag[as];
  const classes = ["mkReveal", className].filter(Boolean).join(" ");

  return (
    <Tag
      ref={(node: HTMLElement | null) => {
        ref.current = node;
      }}
      className={classes}
      data-mk-card=""
      data-mk-pending=""
      data-mk-entered={inView ? "" : undefined}
      data-mk-rail={rail ? "" : undefined}
      data-mk-process-rail={rail ? "" : undefined}
      data-mk-process-connector={connector ? "" : undefined}
      data-mk-process-card={processCard ? "" : undefined}
      aria-hidden={rail || connector || ariaHidden ? true : undefined}
      initial={motionOn ? "hidden" : false}
      animate={motionOn ? (inView ? "visible" : "hidden") : false}
      custom={cardRevealDelay(index)}
      variants={variants}
      onAnimationComplete={(definition) => {
        clearPending(ref.current, definition);
      }}
    >
      {children}
    </Tag>
  );
}

export function MarketingRevealHero({ children }: { children: ReactNode }) {
  const motionOn = useMarketingMotionOn();

  return (
    <m.div
      initial={motionOn ? "hidden" : false}
      whileInView={motionOn ? "visible" : undefined}
      viewport={{ ...HERO_VIEWPORT, once: true }}
      variants={heroContainerVariants}
    >
      {children}
    </m.div>
  );
}

export function MarketingRevealPreview({ children }: { children: ReactNode }) {
  return (
    <MarketingRevealItem variants={HERO_PREVIEW_VARIANTS}>
      {children}
    </MarketingRevealItem>
  );
}
