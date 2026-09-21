/**
 * `useReducedMotion()` is `null` during SSR and a boolean on the client.
 * Hidden/visible Motion variants may only arm once that client value exists.
 * Treating `null` as "motion off" or "motion on" makes the first client
 * render disagree with the server HTML.
 */
export function isMarketingMotionEnabled(
  clientReady: boolean,
  reducedMotion: boolean | null
): boolean {
  return clientReady && reducedMotion === false;
}
