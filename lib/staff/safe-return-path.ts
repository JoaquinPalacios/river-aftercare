/**
 * Same-origin staff path for a post-save redirect.
 * Rejects protocol-relative and external URLs.
 */
export function safeStaffReturnPath(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const path = value.trim();
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.startsWith("/\\") ||
    path.includes("\\") ||
    path.includes("://") ||
    /\s/.test(path)
  ) {
    return null;
  }

  try {
    const url = new URL(path, "http://staff.local");
    if (url.origin !== "http://staff.local") {
      return null;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
