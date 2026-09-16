/**
 * Marketing <title> resolution.
 *
 * Operator SEO titles are complete document titles when they already include
 * the site name (for example "… | River Aftercare"). The layout must not
 * append the brand again.
 */
export function titleAlreadyIncludesSiteName(
  title: string,
  siteName: string
): boolean {
  const needle = siteName.trim().toLocaleLowerCase("en");
  if (!needle) {
    return false;
  }
  return title.toLocaleLowerCase("en").includes(needle);
}

export function marketingDocumentTitle(
  seoTitle: string,
  siteName: string
): string {
  const title = seoTitle.trim();
  const brand = siteName.trim();
  if (!title) {
    return brand;
  }
  if (!brand || titleAlreadyIncludesSiteName(title, brand)) {
    return title;
  }
  return `${title} — ${brand}`;
}
