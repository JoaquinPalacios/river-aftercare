"use client";

import { CmsWelcomeCard } from "@/app/(staff)/components/cms-discovery/discovery-card";
import { useCmsDiscovery } from "@/app/(staff)/components/cms-discovery/cms-discovery-context";

/**
 * Overview-only entry for the clinic CMS introduction.
 * The first visit is a compact prompt. After it is settled, a quiet replay
 * stays on this page. Help & feedback has the same replay.
 */
export function CmsOverviewTourEntry() {
  const discovery = useCmsDiscovery();
  if (!discovery) {
    return null;
  }

  if (discovery.welcome) {
    return (
      <CmsWelcomeCard
        title={discovery.welcome.title}
        body={discovery.welcome.body}
        onStart={discovery.startWelcome}
        onDismiss={discovery.dismissWelcome}
      />
    );
  }

  if (!discovery.replayIntroduction) {
    return null;
  }

  const replay = discovery.replayIntroduction;

  return (
    <p className="cmsOverviewReplay">
      <button
        type="button"
        className="staffBtn staffBtnQuiet"
        data-cms-overview-replay="true"
        onClick={replay}
      >
        Replay workspace tour
      </button>
    </p>
  );
}
