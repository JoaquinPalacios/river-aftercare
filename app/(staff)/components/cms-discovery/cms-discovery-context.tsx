"use client";

import { createContext, useContext } from "react";

export type CmsDiscoveryWelcome = {
  title: string;
  body: string;
};

export type CmsDiscoveryPageTour = {
  id: string;
  title: string;
  start: () => void;
};

export type CmsDiscoveryApi = {
  replay: (experienceId: string) => void;
  canReplay: (experienceId: string) => boolean;
  /**
   * Compact Overview prompt. Present only while the introduction is unsettled,
   * the session is idle, and the current page is Overview.
   */
  welcome: CmsDiscoveryWelcome | null;
  startWelcome: () => void;
  dismissWelcome: () => void;
  /**
   * Invitation for the current page. Null when this page has no tour, the
   * tour is already completed or skipped, or discovery has not loaded.
   * Starting a tour does not clear it.
   */
  pageTour: CmsDiscoveryPageTour | null;
  /** True when this session can see at least one page tour. */
  canRestorePageTours: boolean;
  /**
   * Show eligible page-tour invitations again. Does not change the workspace
   * introduction or feature announcements.
   */
  showPageToursAgain: () => void;
};

const CmsDiscoveryContext = createContext<CmsDiscoveryApi | null>(null);

export const CmsDiscoveryProvider = CmsDiscoveryContext.Provider;

export function useCmsDiscovery(): CmsDiscoveryApi | null {
  return useContext(CmsDiscoveryContext);
}
