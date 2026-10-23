"use client";

import { useCmsDiscovery } from "@/app/(staff)/components/cms-discovery/cms-discovery-context";

/**
 * Quiet replay for the tour registered to the current CMS page.
 * It stays available after completion or dismissal. It does not auto-start.
 */
export function CmsPageTourButton() {
  const discovery = useCmsDiscovery();
  const tour = discovery?.pageTour;
  if (!tour) {
    return null;
  }

  return (
    <button
      type="button"
      className="staffBtn staffBtnQuiet cmsPageTourButton"
      data-cms-page-tour={tour.id}
      onClick={tour.start}
    >
      Tour this page
    </button>
  );
}
