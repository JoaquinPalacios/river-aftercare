"use client";

import { createContext, useContext } from "react";

export type CmsDiscoveryWelcome = {
  title: string;
  body: string;
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
   * Quiet Overview replay after the introduction is settled. Null while the
   * prompt is showing, a tour is open, or the page is not Overview.
   */
  replayIntroduction: (() => void) | null;
};

const CmsDiscoveryContext = createContext<CmsDiscoveryApi | null>(null);

export const CmsDiscoveryProvider = CmsDiscoveryContext.Provider;

export function useCmsDiscovery(): CmsDiscoveryApi | null {
  return useContext(CmsDiscoveryContext);
}
