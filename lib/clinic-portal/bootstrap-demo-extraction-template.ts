import type { PrismaClient } from "@prisma/client";

import {
  BOOTSTRAP_DEMO_TEMPLATE_NOTICE as NOTICE,
  bootstrapDemoExtractionTemplate as bootstrapImpl,
  formatDemoExtractionBootstrapPlan as formatImpl,
  loadDemoExtractionTemplateSnapshot as loadImpl,
  planDemoExtractionBootstrap as planImpl,
} from "./bootstrap-demo-extraction-template.mjs";

export const BOOTSTRAP_DEMO_TEMPLATE_NOTICE: string = NOTICE;

export interface DemoExtractionSectionSnapshot {
  key: string;
  kind: string;
  title: string;
  body: string;
  periodLabel: string | null;
  startDay: number | null;
  endDay: number | null;
  sortOrder: number;
}

export interface DemoExtractionRevisionSnapshot {
  version: number;
  status: string;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  sections: DemoExtractionSectionSnapshot[];
}

export interface DemoExtractionTemplateSnapshot {
  slug: string;
  title: string;
  specialty: string;
  isActive: boolean;
  revisions: DemoExtractionRevisionSnapshot[];
}

export type DemoExtractionBootstrapPlan =
  | {
      action: "create";
      changed: true;
      notice: string;
      template: {
        slug: string;
        title: string;
        specialty: string;
        isActive: true;
      };
      revision: {
        version: number;
        status: "PUBLISHED";
        reviewedAt: null;
        reviewedBy: null;
      };
      sections: DemoExtractionSectionSnapshot[];
    }
  | {
      action: "noop";
      changed: false;
      notice: string;
      reason: string;
    }
  | {
      action: "refuse";
      changed: false;
      notice: string;
      reason: string;
    };

export interface DemoExtractionBootstrapResult {
  plan: DemoExtractionBootstrapPlan;
  applied: boolean;
}

export function planDemoExtractionBootstrap(
  existing: DemoExtractionTemplateSnapshot | null
): DemoExtractionBootstrapPlan {
  return planImpl(existing) as DemoExtractionBootstrapPlan;
}

export async function loadDemoExtractionTemplateSnapshot(
  prisma: PrismaClient
): Promise<DemoExtractionTemplateSnapshot | null> {
  return loadImpl(prisma) as Promise<DemoExtractionTemplateSnapshot | null>;
}

export async function bootstrapDemoExtractionTemplate(input: {
  prisma: PrismaClient;
  apply: boolean;
}): Promise<DemoExtractionBootstrapResult> {
  return bootstrapImpl(input) as Promise<DemoExtractionBootstrapResult>;
}

export function formatDemoExtractionBootstrapPlan(
  plan: DemoExtractionBootstrapPlan
): string {
  return formatImpl(plan);
}
