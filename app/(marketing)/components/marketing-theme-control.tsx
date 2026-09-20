"use client";

import { AppearanceMenu } from "@/lib/branding/appearance-menu";
import { MARKETING_THEME_STORAGE_KEY } from "@/lib/branding/theme-preference";

export function MarketingThemeControl() {
  return (
    <AppearanceMenu
      storageKey={MARKETING_THEME_STORAGE_KEY}
      classPrefix="mtc"
      shareProductCookie
    />
  );
}
