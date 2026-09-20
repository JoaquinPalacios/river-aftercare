import type { Page, Response } from "@playwright/test";

import { PRODUCT_ICON_HREFS, PRODUCT_WEB_MANIFEST_SRC } from "@/lib/seo/icons";
import { PRODUCT_FAVICON_ICO_SRC } from "@/lib/branding/product-assets";

const ICON_REL = /<link\b[^>]*\brel=["']([^"']*icon[^"']*)["'][^>]*>/gi;

export function iconLinkTags(html: string): string[] {
  return html.match(new RegExp(ICON_REL.source, "gi")) ?? [];
}

export function iconHref(tag: string): string {
  return tag.match(/\bhref=["']([^"']+)["']/i)?.[1] ?? "";
}

export function iconRel(tag: string): string {
  return tag.match(/\brel=["']([^"']+)["']/i)?.[1] ?? "";
}

export function iconHrefs(html: string): string[] {
  return iconLinkTags(html).map(iconHref);
}

export function pathnameOf(href: string): string {
  return href.split("?")[0];
}

export function isFileConventionIconHref(href: string): boolean {
  const path = pathnameOf(href);
  if (path === "/favicon.ico") {
    return true;
  }
  return (
    /^\/icon(\.|$)/.test(path) ||
    /^\/apple-icon(\.|$)/.test(path) ||
    /\/favicon\.ico\?favicon\./.test(href)
  );
}

export function isRiverPackHref(href: string): boolean {
  const path = pathnameOf(href);
  return PRODUCT_ICON_HREFS.some((src) => path === src);
}

export function clinicBrandingHrefs(html: string): string[] {
  return iconHrefs(html).filter((href) =>
    pathnameOf(href).includes("/clinic-branding/")
  );
}

export function hasRiverWebManifest(html: string): boolean {
  return html.includes(PRODUCT_WEB_MANIFEST_SRC);
}

export function riverIcoHref(): string {
  return PRODUCT_FAVICON_ICO_SRC;
}

export function headDump(html: string): string {
  const icons = iconLinkTags(html);
  const theme =
    html.match(/<meta\b[^>]*\bname=["']theme-color["'][^>]*>/gi) ?? [];
  const manifest =
    html.match(/<link\b[^>]*\brel=["']manifest["'][^>]*>/gi) ?? [];
  return [...icons, ...manifest, ...theme].join("\n") + "\n";
}

export async function collectAssetResponses(
  page: Page,
  predicate: (url: string) => boolean
): Promise<{ url: string; status: number; contentType: string }[]> {
  const seen: { url: string; status: number; contentType: string }[] = [];
  const onResponse = async (response: Response) => {
    const url = response.url();
    if (!predicate(url)) {
      return;
    }
    seen.push({
      url,
      status: response.status(),
      contentType: response.headers()["content-type"] ?? "",
    });
  };
  page.on("response", onResponse);
  return seen;
}

export async function chromiumTargetFaviconUrl(
  page: Page
): Promise<string | null> {
  const browserName = page.context().browser()?.browserType().name();
  if (browserName !== "chromium") {
    return null;
  }
  try {
    const session = await page.context().newCDPSession(page);
    const result = (await session.send("Target.getTargetInfo")) as {
      targetInfo?: { faviconUrl?: string };
    };
    return result.targetInfo?.faviconUrl || null;
  } catch {
    return null;
  }
}
