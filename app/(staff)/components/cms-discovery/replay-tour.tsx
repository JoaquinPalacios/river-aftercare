"use client";

import { useCmsDiscovery } from "@/app/(staff)/components/cms-discovery/cms-discovery-context";
import { CMS_INTRODUCTION_ID } from "@/lib/cms-discovery/registry";

export function CmsTourReplay() {
  const discovery = useCmsDiscovery();
  if (discovery && !discovery.canReplay(CMS_INTRODUCTION_ID)) {
    return null;
  }

  return (
    <section
      className="cmsDiscoveryCard"
      aria-labelledby="cms-tour-replay-heading"
      data-cms-discovery="help-replay"
    >
      <h2 id="cms-tour-replay-heading" className="cmsDiscoveryTitle">
        Workspace tour
      </h2>
      <p className="cmsDiscoveryBody">
        Replay the introduction to Overview, Guides, Sites & Locations, and the
        other parts of the clinic workspace available to you.
      </p>
      <div className="cmsDiscoveryActions">
        <button
          type="button"
          className="staffBtn staffBtnSecondary"
          onClick={() => discovery?.replay(CMS_INTRODUCTION_ID)}
        >
          Replay tour
        </button>
      </div>
    </section>
  );
}
