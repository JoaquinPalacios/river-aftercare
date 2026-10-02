export const PHYSIO_DEMO_EXAMPLE_LABEL = "View live physiotherapy example";

/**
 * Absolute public URL of the physiotherapy patient demo.
 * Unset until DNS, Vercel, and the published guide are verified.
 * An empty or invalid value keeps the marketing action disabled.
 */
export function physiotherapyDemoExampleHref(
  env:
    | NodeJS.ProcessEnv
    | { CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL?: string } = process.env
): string | null {
  const value = env.CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL?.trim() ?? "";
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}
