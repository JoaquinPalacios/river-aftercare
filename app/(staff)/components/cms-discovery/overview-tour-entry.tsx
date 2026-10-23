"use client";

import { CmsWelcomeCard } from "@/app/(staff)/components/cms-discovery/discovery-card";
import { useCmsDiscovery } from "@/app/(staff)/components/cms-discovery/cms-discovery-context";

/**
 * Overview-only entry for the clinic CMS introduction.
 * The first visit is a compact prompt. After it is settled, this page stays
 * clear. Help & feedback keeps Replay workspace tour.
 */
export function CmsOverviewTourEntry() {
  const discovery = useCmsDiscovery();
  if (!discovery?.welcome) {
    return null;
  }

  return (
    <CmsWelcomeCard
      title={discovery.welcome.title}
      body={discovery.welcome.body}
      onStart={discovery.startWelcome}
      onDismiss={discovery.dismissWelcome}
    />
  );
}
