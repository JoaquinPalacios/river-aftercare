import { ClinicMembershipRole, type PracticeGuideStatus } from "@prisma/client";

import {
  SERVICE_CATEGORIES,
  serviceCategoryLabel,
  type ServiceCategory,
} from "@/lib/aftercare/service-category";
import {
  clinicSetupChecks,
  type ClinicSetupCheck,
  type ClinicSetupInput,
} from "@/lib/clinic-portal/setup-status";

export type OwnerSetupAudience = "admin" | "staff";

export type OwnerSetupItemId =
  "practice" | "contact" | "emergency" | "categories" | "guide" | "published";

export interface OwnerSetupAction {
  href: string;
  label: string;
}

export interface OwnerSetupItem {
  id: OwnerSetupItemId;
  label: string;
  detail: string;
  state: "configured" | "needs_attention";
  actions: OwnerSetupAction[];
}

export interface OwnerSetupTemplateRow {
  id: string;
  title: string;
  serviceCategory: ServiceCategory;
  categoryLabel: string;
  alreadyAdded: boolean;
}

export interface OwnerSetupTemplateGroup {
  serviceCategory: ServiceCategory;
  label: string;
  templates: OwnerSetupTemplateRow[];
}

export interface OwnerSetupGuide {
  id: string;
  title: string;
  status: PracticeGuideStatus;
  retained: boolean;
  guideTemplateId: string | null;
  sourceGuideTemplateId: string | null;
}

export interface OwnerSetupInput {
  audience: OwnerSetupAudience;
  /**
   * Same fields the existing clinic setup checks use. A stored default is
   * complete only when those checks already treat it as complete.
   */
  profile: ClinicSetupInput;
  serviceCategories: readonly ServiceCategory[];
  /** Existing Sites screen for the primary site, or the sites list. */
  sitesHref: string;
  templates: ReadonlyArray<{
    id: string;
    title: string;
    serviceCategory: ServiceCategory;
    alreadyAdded: boolean;
  }>;
  guides: readonly OwnerSetupGuide[];
  /** False when the plan has no remaining custom-guide place. */
  customGuidePermitted: boolean;
}

export interface OwnerSetupSummary {
  audience: OwnerSetupAudience;
  items: OwnerSetupItem[];
  templateGroups: OwnerSetupTemplateGroup[];
  showTemplateCatalogue: boolean;
  ready: boolean;
}

export function ownerSetupAudience(membership: {
  role: ClinicMembershipRole;
  source?: "membership" | "operator_support";
}): OwnerSetupAudience {
  if (
    membership.source === "operator_support" ||
    membership.role === ClinicMembershipRole.ADMIN
  ) {
    return "admin";
  }
  return "staff";
}

function check(
  checks: ClinicSetupCheck[],
  id: ClinicSetupCheck["id"]
): ClinicSetupCheck | undefined {
  return checks.find((item) => item.id === id);
}

function activeGuides(guides: readonly OwnerSetupGuide[]): OwnerSetupGuide[] {
  return guides.filter((guide) => !guide.retained);
}

function categoryLabel(category: ServiceCategory): string {
  return serviceCategoryLabel(category) ?? category;
}

function practiceDetail(
  identity: ClinicSetupCheck | undefined,
  branding: ClinicSetupCheck | undefined
): string {
  const missing = [identity, branding].filter(
    (item): item is ClinicSetupCheck =>
      item !== undefined && item.state !== "configured"
  );
  if (missing.length === 0) {
    return "Display name, logo, and branding are set.";
  }
  return missing.map((item) => item.detail).join(" ");
}

function guideDetail(input: {
  guides: OwnerSetupGuide[];
  templates: OwnerSetupInput["templates"];
  categories: ServiceCategory[];
  customGuidePermitted: boolean;
}): string {
  if (input.categories.length === 0) {
    return "Add a practice category before creating a guide.";
  }
  if (input.guides.length === 0) {
    if (input.templates.length === 0) {
      return input.customGuidePermitted
        ? "No published template is available for these categories. Create a custom guide. The clinic writes that clinical content."
        : "No published template is available for these categories. This plan has no custom-guide place available.";
    }
    const count = input.templates.length;
    return count === 1
      ? "One published template matches this clinic. Create a guide when you choose it."
      : `${count} published templates match this clinic. Create a guide when you choose one.`;
  }
  return savedGuideSentence(input.guides);
}

function countPhrase(count: number, singular: string): string | null {
  if (count <= 0) {
    return null;
  }
  return count === 1 ? `1 ${singular}` : `${count} ${singular}s`;
}

function savedGuideSentence(guides: OwnerSetupGuide[]): string {
  const templateCount = guides.filter((guide) => guide.guideTemplateId).length;
  const customCount = guides.filter(
    (guide) => !guide.guideTemplateId && !guide.sourceGuideTemplateId
  ).length;
  const adaptedCount = guides.length - templateCount - customCount;
  const phrases = [
    countPhrase(templateCount, "template guide"),
    countPhrase(customCount, "custom guide"),
    countPhrase(adaptedCount, "adapted guide"),
  ].filter((phrase): phrase is string => Boolean(phrase));
  if (phrases.length === 0) {
    return "A guide is saved.";
  }
  const sentence = phrases.join(" and ");
  const verb = phrases.length === 1 && !sentence.endsWith("s") ? "is" : "are";
  return `${sentence} ${verb} saved.`;
}

function publishTarget(guides: OwnerSetupGuide[]): OwnerSetupGuide | null {
  return (
    guides.find((guide) => guide.status === "DRAFT") ??
    guides.find((guide) => guide.status !== "PUBLISHED") ??
    null
  );
}

/**
 * Owner setup for an assisted clinic. Completion is derived from the clinic
 * profile, categories, guides, and eligible templates. Payment authorisation
 * stays on the billing gate and is not an item here.
 */
export function deriveOwnerSetup(input: OwnerSetupInput): OwnerSetupSummary {
  const checks = clinicSetupChecks(input.profile);
  const identity = check(checks, "identity");
  const branding = check(checks, "branding");
  const contact = check(checks, "contact");
  const emergency = check(checks, "emergency");
  const published = check(checks, "published");
  const categories = SERVICE_CATEGORIES.filter((category) =>
    input.serviceCategories.includes(category)
  );
  const guides = activeGuides(input.guides);
  const canAct = input.audience === "admin";
  const practiceConfigured =
    identity?.state === "configured" && branding?.state === "configured";
  const categoriesConfigured = categories.length > 0;
  const guideConfigured = guides.length > 0;
  const publishedConfigured = published?.state === "configured";
  const customPath =
    canAct &&
    input.customGuidePermitted &&
    categoriesConfigured &&
    !guideConfigured;

  const practiceActions: OwnerSetupAction[] = [];
  if (canAct && !practiceConfigured) {
    practiceActions.push({
      href:
        identity?.state === "configured"
          ? "/practice#practice-branding"
          : "/practice#practice-identity",
      label: "Complete Practice details",
    });
  }

  const contactActions: OwnerSetupAction[] =
    canAct && contact?.state !== "configured"
      ? [
          {
            href: "/practice#practice-contact",
            label: "Add clinic contact",
          },
        ]
      : [];

  const emergencyActions: OwnerSetupAction[] =
    canAct && emergency && emergency.state !== "configured"
      ? [
          {
            href: "/practice#practice-emergency",
            label: "Add emergency instructions",
          },
        ]
      : [];

  const categoryActions: OwnerSetupAction[] =
    canAct && !categoriesConfigured
      ? [
          {
            href: input.sitesHref,
            label: "Add practice categories",
          },
        ]
      : [];

  const guideActions: OwnerSetupAction[] = [];
  if (canAct && !guideConfigured && categoriesConfigured) {
    if (input.templates.length > 0) {
      guideActions.push({
        href: "/guides/new",
        label: "Review templates",
      });
    }
    if (customPath) {
      guideActions.push({
        href: "/guides/new#custom-guide",
        label: "Create a custom guide",
      });
    }
  }

  const publishGuide = publishTarget(guides);
  const publishedActions: OwnerSetupAction[] =
    canAct && !publishedConfigured && publishGuide
      ? [
          {
            href: `/guides/${publishGuide.id}/edit`,
            label: "Preview and publish",
          },
        ]
      : [];

  const items: OwnerSetupItem[] = [
    {
      id: "practice",
      label: "Practice details",
      detail: practiceDetail(identity, branding),
      state: practiceConfigured ? "configured" : "needs_attention",
      actions: practiceActions,
    },
    {
      id: "contact",
      label: "Contact information",
      detail: contact?.detail ?? "Add a phone number or contact URL.",
      state: contact?.state === "configured" ? "configured" : "needs_attention",
      actions: contactActions,
    },
  ];

  if (emergency) {
    items.push({
      id: "emergency",
      label: "Emergency instructions",
      detail: emergency.detail,
      state: emergency.state,
      actions: emergencyActions,
    });
  }

  items.push(
    {
      id: "categories",
      label: "Practice categories",
      detail: categoriesConfigured
        ? categories.map((category) => categoryLabel(category)).join(", ")
        : "Choose the services this clinic provides.",
      state: categoriesConfigured ? "configured" : "needs_attention",
      actions: categoryActions,
    },
    {
      id: "guide",
      label: "First guide",
      detail: guideDetail({
        guides,
        templates: input.templates,
        categories,
        customGuidePermitted: input.customGuidePermitted,
      }),
      state: guideConfigured ? "configured" : "needs_attention",
      actions: guideActions,
    },
    {
      id: "published",
      label: "Published guide",
      detail: published?.detail ?? "No published guide is available yet.",
      state: publishedConfigured ? "configured" : "needs_attention",
      actions: publishedActions,
    }
  );

  const templateGroups: OwnerSetupTemplateGroup[] = categories.map(
    (serviceCategory) => ({
      serviceCategory,
      label: categoryLabel(serviceCategory),
      templates: input.templates
        .filter((template) => template.serviceCategory === serviceCategory)
        .map((template) => ({
          id: template.id,
          title: template.title,
          serviceCategory,
          categoryLabel: categoryLabel(serviceCategory),
          alreadyAdded: template.alreadyAdded,
        })),
    })
  );

  return {
    audience: input.audience,
    items,
    templateGroups,
    showTemplateCatalogue: !publishedConfigured && categoriesConfigured,
    ready: items.every((item) => item.state === "configured"),
  };
}
