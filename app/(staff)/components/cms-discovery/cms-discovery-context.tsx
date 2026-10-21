"use client";

import { createContext, useContext } from "react";

export type CmsDiscoveryApi = {
  replay: (experienceId: string) => void;
  canReplay: (experienceId: string) => boolean;
};

const CmsDiscoveryContext = createContext<CmsDiscoveryApi | null>(null);

export const CmsDiscoveryProvider = CmsDiscoveryContext.Provider;

export function useCmsDiscovery(): CmsDiscoveryApi | null {
  return useContext(CmsDiscoveryContext);
}
