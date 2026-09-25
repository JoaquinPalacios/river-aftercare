/** Patient path for one placement. Root locations stay unprefixed. */
export function placementPublicPath(input: {
  servesSiteRoot: boolean;
  locationSlug: string | null;
  publicSlug: string;
}): string {
  if (input.servesSiteRoot || !input.locationSlug) {
    return `/${input.publicSlug}`;
  }
  return `/${input.locationSlug}/${input.publicSlug}`;
}
