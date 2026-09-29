import { GuideSection } from "@/app/(aftercare)/components/guide-section";
import { GuideTimeline } from "@/app/(aftercare)/components/guide-timeline";
import { HomeCarePlan } from "@/app/(aftercare)/components/home-care-plan";
import { groupGuideSections } from "@/lib/aftercare/group-guide-sections";
import type { ComposedGuideSection } from "@/lib/aftercare/types";

export function GuideDocument({
  sections,
}: {
  sections: ComposedGuideSection[];
}) {
  const blocks = groupGuideSections(sections);

  return (
    <div data-guide-document="">
      {blocks.map((block) =>
        block.type === "timeline" ? (
          <GuideTimeline
            key={block.sections[0]?.key ?? "timeline"}
            sections={block.sections}
          />
        ) : block.section.kind === "HOME_CARE_PLAN" ? (
          <HomeCarePlan key={block.section.key} section={block.section} />
        ) : (
          <GuideSection key={block.section.key} section={block.section} />
        )
      )}
    </div>
  );
}
