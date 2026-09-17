function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

/**
 * Public origin for exact-key assets delivered through the Vercel `assets.` host.
 * Shared by clinic branding and platform SEO images. Not a credential.
 */
export function clinicAssetPublicOrigin(): string | null {
  const raw = readEnv("CLINIC_ASSET_PUBLIC_ORIGIN");
  if (!raw) {
    return null;
  }

  try {
    const url = new URL(raw);
    if (url.username || url.password) {
      return null;
    }
    if (url.pathname !== "/" && url.pathname !== "") {
      return null;
    }
    if (url.search || url.hash) {
      return null;
    }
    if (url.protocol === "https:") {
      return url.origin;
    }
    if (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    ) {
      return url.origin;
    }
    return null;
  } catch {
    return null;
  }
}
