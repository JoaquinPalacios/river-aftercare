"use client";

import { GuideSectionKindIcon } from "@/app/(staff)/components/guide-section-kind-icon";
import {
  guideBlockFamily,
  guideEditorBlockSummary,
  guideOutlineEntry,
} from "@/lib/aftercare/guide-block-presentation";
import type { GuideSectionKind } from "@/lib/aftercare/types";

export function CanonicalGuideOutline({
  sections,
  onSelect,
}: {
  sections: Array<{
    key: string;
    kind: GuideSectionKind;
    title: string;
    periodLabel: string;
  }>;
  onSelect: (key: string) => void;
}) {
  if (sections.length === 0) {
    return null;
  }

  return (
    <div className="canonicalOutline">
      <details className="canonicalOutlineCompact">
        <summary>Guide outline</summary>
        <OutlineList sections={sections} onSelect={onSelect} />
      </details>
      <nav className="canonicalOutlineRail" aria-label="Guide outline">
        <h2 className="canonicalOutlineHeading">Guide outline</h2>
        <OutlineList sections={sections} onSelect={onSelect} />
      </nav>
    </div>
  );
}

function OutlineList({
  sections,
  onSelect,
}: {
  sections: Array<{
    key: string;
    kind: GuideSectionKind;
    title: string;
    periodLabel: string;
  }>;
  onSelect: (key: string) => void;
}) {
  return (
    <ol className="canonicalOutlineList">
      {sections.map((section) => {
        const entry = guideOutlineEntry(section);
        const summary = guideEditorBlockSummary(section);
        return (
          <li key={section.key}>
            <button
              type="button"
              className="canonicalOutlineItem"
              data-outline-key={section.key}
              data-block-family={guideBlockFamily(section.kind)}
              aria-controls={`canonical-block-${section.key}`}
              onClick={() => onSelect(section.key)}
            >
              <span className="canonicalOutlineIcon">
                <GuideSectionKindIcon kind={section.kind} />
              </span>
              <span className="canonicalOutlineCopy">
                {entry.detail ? (
                  <span className="canonicalOutlineDetail">{entry.detail}</span>
                ) : null}
                <span className="canonicalOutlineTitle">{entry.title}</span>
              </span>
              <span className="sr-only">{summary}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
