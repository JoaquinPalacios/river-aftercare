import type { Metadata } from "next";
import { headers } from "next/headers";

import {
  instructionLabel,
  parseInstructionTerminology,
} from "@/lib/aftercare/instruction-terminology";
import {
  resolveAftercareTheme,
  type AftercareThemeInput,
} from "@/lib/branding/aftercare-theme";
import { parseThemeMode } from "@/lib/branding/theme-preference";
import { resolveClinicLogoSrc } from "@/lib/clinic-assets/public-url";
import { PRODUCT_HEAD_METADATA } from "@/lib/seo/icons";
import { sanitizeMetadataText } from "@/lib/seo/metadata-text";
import { TENANT_LAUNCH_ROBOTS } from "@/lib/seo/robots-policy";

export const AFTERCARE_ROBOTS = TENANT_LAUNCH_ROBOTS;

const INSTRUCTION_NOUN = {
  AFTERCARE: "Aftercare",
  POST_TREATMENT: "Post-treatment",
  POST_PROCEDURE: "Post-procedure",
  POST_OPERATIVE: "Post-operative",
  RECOVERY: "Recovery",
} as const;

export async function publicTenantCanonicalUrl(
  pathname: string
): Promise<string | undefined> {
  if (pathname.includes("/_sites")) {
    return undefined;
  }

  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");

  if (!host) {
    return undefined;
  }

  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");
  const normalizedPath = pathname === "" || pathname === "/" ? "/" : pathname;

  // Canonical URLs always mirror the incoming Host. They must not hard-code
  // `.localhost` or a commercial platform domain.
  return `${protocol}://${host}${normalizedPath}`;
}

export function tenantGuideDocumentTitle(
  guideTitle: string,
  practiceName: string,
  terminology?: string | null
): string {
  const title = sanitizeMetadataText(guideTitle, 80);
  const practice = sanitizeMetadataText(practiceName, 80);
  const noun = INSTRUCTION_NOUN[parseInstructionTerminology(terminology)];
  return `${title} ${noun} | ${practice}`;
}

export function tenantGuideDescription(
  guideTitle: string,
  practiceName: string,
  terminology?: string | null
): string {
  const title = sanitizeMetadataText(guideTitle, 80).toLowerCase();
  const practice = sanitizeMetadataText(practiceName, 80);
  return `${instructionLabel(terminology)} for ${title} from ${practice}.`;
}

export function clinicFaviconMetadata(
  faviconUrl: string | null | undefined
): Pick<Metadata, "icons"> {
  const src = resolveClinicLogoSrc(faviconUrl);
  if (!src) {
    return { icons: PRODUCT_HEAD_METADATA.icons };
  }

  return {
    icons: {
      icon: [{ url: src, type: "image/png" }],
      apple: [{ url: src, type: "image/png" }],
    },
  };
}

export function clinicThemeColorMetadata(
  input: AftercareThemeInput | null | undefined
): Pick<Metadata, "themeColor"> {
  const theme = resolveAftercareTheme(input);
  const light = theme.light["--cg-brand"];
  const dark = theme.dark["--cg-brand"];
  const mode = parseThemeMode(input?.themeMode);

  if (mode === "LIGHT") {
    return { themeColor: light };
  }
  if (mode === "DARK") {
    return { themeColor: dark };
  }

  return {
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: light },
      { media: "(prefers-color-scheme: dark)", color: dark },
    ],
  };
}

export function aftercareThemeFromProfile(
  profile:
    | {
        primaryColor?: string | null;
        accentColor?: string | null;
        darkPrimaryColor?: string | null;
        darkAccentColor?: string | null;
        useCustomDarkBranding?: boolean | null;
        neutralColor?: string | null;
        radiusPreset?: string | null;
        themeMode?: string | null;
        faviconUrl?: string | null;
      }
    | null
    | undefined
): AftercareThemeInput & { faviconUrl?: string | null } {
  return {
    primaryColor: profile?.primaryColor ?? null,
    accentColor: profile?.accentColor ?? null,
    darkPrimaryColor: profile?.darkPrimaryColor ?? null,
    darkAccentColor: profile?.darkAccentColor ?? null,
    useCustomDarkBranding: profile?.useCustomDarkBranding ?? false,
    neutralColor: profile?.neutralColor ?? null,
    radiusPreset: profile?.radiusPreset ?? null,
    themeMode: profile?.themeMode ?? null,
    faviconUrl: profile?.faviconUrl ?? null,
  };
}

export function aftercareTenantBrandMetadata(
  profile:
    | (AftercareThemeInput & {
        faviconUrl?: string | null;
      })
    | null
    | undefined
): Pick<Metadata, "icons" | "themeColor"> {
  return {
    ...clinicFaviconMetadata(profile?.faviconUrl),
    ...clinicThemeColorMetadata(profile),
  };
}

export function aftercarePageMetadata(input: {
  title: string;
  description: string;
  canonicalUrl?: string;
  siteName?: string;
  faviconUrl?: string | null;
  theme?: AftercareThemeInput | null;
}): Metadata {
  const title = sanitizeMetadataText(input.title, 70);
  const description = sanitizeMetadataText(input.description, 180);
  const siteName = input.siteName
    ? sanitizeMetadataText(input.siteName, 80)
    : undefined;
  const brand = aftercareTenantBrandMetadata({
    ...aftercareThemeFromProfile(input.theme),
    faviconUrl: input.faviconUrl,
  });

  return {
    title,
    description,
    robots: AFTERCARE_ROBOTS,
    alternates: input.canonicalUrl
      ? { canonical: input.canonicalUrl }
      : undefined,
    openGraph: {
      type: "website",
      locale: "en",
      title,
      description,
      url: input.canonicalUrl,
      siteName,
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    ...brand,
  };
}
