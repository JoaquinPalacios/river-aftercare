/**
 * Request pathname forwarded with a tenant rewrite.
 * `proxy.ts` overwrites this from the requested path. It is not a destination
 * URL and it is not a database lookup.
 */
export const PUBLIC_PATIENT_PATH_HEADER = "x-care-guide-public-path";
