"use client";

import { useCmsDiscovery } from "@/app/(staff)/components/cms-discovery/cms-discovery-context";
import { CMS_INTRODUCTION_ID } from "@/lib/cms-discovery/registry";

export function CmsTourReplay() {
  const discovery = useCmsDiscovery();
  const pageTours = discovery?.pageTours ?? [];
  const showWorkspace = !discovery || discovery.canReplay(CMS_INTRODUCTION_ID);
  if (!showWorkspace && pageTours.length === 0) {
    return null;
  }

  return (
    <section
      className="cmsTourReplayPanel"
      aria-labelledby="cms-tour-replay-heading"
      data-cms-discovery="help-replay"
    >
      {showWorkspace ? (
        <div className="cmsTourReplayCopy">
          <h2 id="cms-tour-replay-heading" className="cmsDiscoveryTitle">
            Workspace tour
          </h2>
          <p className="cmsDiscoveryBody">
            Replay the introduction to the clinic navigation. It highlights
            Overview, Guides, Practice when you can open it, Sites & Locations,
            the patient site when it is available, and Help & feedback, without
            leaving the page you are on.
          </p>
        </div>
      ) : (
        <h2 id="cms-tour-replay-heading" className="cmsDiscoveryTitle">
          Tours
        </h2>
      )}
      {showWorkspace ? (
        <button
          type="button"
          className="staffBtn staffBtnSecondary"
          onClick={() => discovery?.replay(CMS_INTRODUCTION_ID)}
        >
          Replay tour
        </button>
      ) : null}
      {pageTours.length > 0 ? (
        <div className="cmsPageTourCatalog">
          <h3 className="cmsDiscoveryTitle">Page tours</h3>
          <ul className="cmsPageTourList">
            {pageTours.map((tour) => (
              <li key={tour.id}>
                <button
                  type="button"
                  className="staffBtn staffBtnQuiet cmsPageTourButton"
                  onClick={tour.start}
                >
                  {tour.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
