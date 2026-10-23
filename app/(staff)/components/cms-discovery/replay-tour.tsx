"use client";

import { useCmsDiscovery } from "@/app/(staff)/components/cms-discovery/cms-discovery-context";
import { CMS_INTRODUCTION_ID } from "@/lib/cms-discovery/registry";

export function CmsTourReplay() {
  const discovery = useCmsDiscovery();
  const showWorkspace = !discovery || discovery.canReplay(CMS_INTRODUCTION_ID);
  const showRestore = !discovery || discovery.canRestorePageTours;
  if (!showWorkspace && !showRestore) {
    return null;
  }

  return (
    <section
      className="cmsGuidedTours"
      aria-labelledby="cms-guided-tours-heading"
      data-cms-discovery="help-replay"
    >
      <h2 id="cms-guided-tours-heading" className="cmsGuidedToursTitle">
        Guided tours
      </h2>
      <div className="cmsGuidedToursActions">
        {showWorkspace ? (
          <button
            type="button"
            className="staffBtn staffBtnQuiet cmsPageTourButton"
            onClick={() => discovery?.replay(CMS_INTRODUCTION_ID)}
          >
            Replay workspace tour
          </button>
        ) : null}
        {showRestore ? (
          <button
            type="button"
            className="staffBtn staffBtnQuiet cmsPageTourButton"
            onClick={() => discovery?.showPageToursAgain()}
          >
            Show page tours again
          </button>
        ) : null}
      </div>
    </section>
  );
}
