"use client";

import { createContext, useContext } from "react";

export type PlanChangeSelectionContextValue = {
  reportEditing: (editing: boolean) => void;
  primarySlot: HTMLElement | null;
  secondarySlot: HTMLElement | null;
};

export const PlanChangeSelectionContext =
  createContext<PlanChangeSelectionContextValue | null>(null);

export function usePlanChangeSelectionContext() {
  return useContext(PlanChangeSelectionContext);
}
