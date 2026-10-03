import "server-only";

import { GuideRevisionStatus, type Prisma } from "@prisma/client";

import type { CanonicalDraftSection } from "@/lib/canonical-templates/sections";

const publishedCanonicalContentInclude = {
  sections: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      homeCareInstructions: { orderBy: { sortOrder: "asc" as const } },
    },
  },
} as const;

type PublishedCanonicalRevision = Prisma.GuideTemplateRevisionGetPayload<{
  include: typeof publishedCanonicalContentInclude;
}>;

/**
 * Maps stored canonical sections into the draft shape used by the next
 * revision and by template duplication. Keys stay with the content. Database
 * ids are not copied.
 */
export function canonicalDraftSectionsFromStored(
  sections: PublishedCanonicalRevision["sections"]
): CanonicalDraftSection[] {
  return sections.map((section) => ({
    key: section.key,
    kind: section.kind,
    title: section.title,
    body: section.body,
    periodLabel: section.periodLabel,
    startDay: section.startDay,
    endDay: section.endDay,
    sortOrder: section.sortOrder,
    homeCareInstructions: section.homeCareInstructions.map((item) => ({
      key: item.key,
      title: item.title,
      body: item.body,
      frequencyCount: item.frequencyCount,
      frequencyPeriod: item.frequencyPeriod,
      timingLabel: item.timingLabel,
      durationValue: item.durationValue,
      durationUnit: item.durationUnit,
      sortOrder: item.sortOrder,
    })),
  }));
}

/**
 * Latest published revision for one template, including ordered sections and
 * home-care instructions. Null when the template has never been published.
 */
export async function loadLatestPublishedCanonicalContent(
  tx: Prisma.TransactionClient,
  templateId: string
): Promise<{
  revisionId: string;
  version: number;
  sections: CanonicalDraftSection[];
} | null> {
  const latest = await tx.guideTemplateRevision.findFirst({
    where: {
      guideTemplateId: templateId,
      status: GuideRevisionStatus.PUBLISHED,
    },
    orderBy: { version: "desc" },
    include: publishedCanonicalContentInclude,
  });
  if (!latest) {
    return null;
  }
  return {
    revisionId: latest.id,
    version: latest.version,
    sections: canonicalDraftSectionsFromStored(latest.sections),
  };
}
