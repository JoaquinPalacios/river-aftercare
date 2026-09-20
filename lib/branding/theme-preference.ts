export const THEME_PREFERENCES = ["system", "light", "dark"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const CLINIC_THEME_MODES = ["LIGHT", "DARK", "SYSTEM"] as const;

export type ClinicThemeMode = (typeof CLINIC_THEME_MODES)[number];

export const MARKETING_THEME_STORAGE_KEY = "aftercare-guide-marketing-theme";
export const PATIENT_THEME_STORAGE_KEY = "aftercare-guide-patient-theme";
export const PORTAL_THEME_STORAGE_KEY = "aftercare-guide-portal-theme";
export const PRODUCT_THEME_COOKIE_NAME = "aftercare-guide-ui-theme";

export type ThemePreferenceBootstrapOptions = {
  fallbackStorageKey?: string;
  cookieName?: string;
  defaultPreference?: ThemePreference;
};

export function parseThemeMode(
  value: string | null | undefined
): ClinicThemeMode {
  if (typeof value !== "string") {
    return "SYSTEM";
  }

  const normalized = value.trim().toUpperCase();
  if (
    normalized === "LIGHT" ||
    normalized === "DARK" ||
    normalized === "SYSTEM"
  ) {
    return normalized;
  }

  return "SYSTEM";
}

export function parseThemePreference(
  value: string | null | undefined
): ThemePreference | null {
  if (value === "system" || value === "light" || value === "dark") {
    return value;
  }

  return null;
}

export function colorSchemeForThemeMode(mode: ClinicThemeMode): string {
  if (mode === "LIGHT") {
    return "light";
  }

  if (mode === "DARK") {
    return "dark";
  }

  return "light dark";
}

export function productThemeCookieDomain(rootDomain: string): string {
  if (rootDomain === "localhost" || rootDomain.endsWith(".localhost")) {
    return ".localhost";
  }

  return `.${rootDomain}`;
}

export function applyThemePreference(
  preference: ThemePreference,
  options?: { productCookie?: boolean }
): void {
  document.documentElement.setAttribute("data-theme-mode", preference);
  if (options?.productCookie) {
    persistProductThemeCookie(preference);
  }
}

export function persistProductThemeCookie(preference: ThemePreference): void {
  if (typeof document === "undefined") {
    return;
  }

  const domain = document.documentElement.getAttribute(
    "data-theme-cookie-domain"
  );
  let cookie = `${PRODUCT_THEME_COOKIE_NAME}=${preference}; Path=/; Max-Age=31536000; SameSite=Lax`;
  if (typeof location !== "undefined" && location.protocol === "https:") {
    cookie += "; Secure";
  }
  if (domain) {
    document.cookie = `${cookie}; Domain=${domain}`;
  }
  document.cookie = cookie;
}

export function readPortalThemePreference(): ThemePreference {
  if (typeof document === "undefined") {
    return "system";
  }

  const fromDom = parseThemePreference(
    document.documentElement.getAttribute("data-theme-mode")
  );
  if (fromDom) {
    return fromDom;
  }

  try {
    return (
      parseThemePreference(localStorage.getItem(PORTAL_THEME_STORAGE_KEY)) ??
      "system"
    );
  } catch {
    return "system";
  }
}

export function themePreferenceBootstrapScript(
  storageKey: string,
  options?: ThemePreferenceBootstrapOptions
): string {
  const key = JSON.stringify(storageKey);
  const fallback = JSON.stringify(options?.fallbackStorageKey ?? null);
  const cookieName = JSON.stringify(options?.cookieName ?? null);
  const defaultPreference = JSON.stringify(options?.defaultPreference ?? null);
  return `(function(){try{var v=localStorage.getItem(${key});if(v!=="light"&&v!=="dark"&&v!=="system"){var f=${fallback};if(typeof f==="string"){v=localStorage.getItem(f);}}if(v!=="light"&&v!=="dark"&&v!=="system"){var c=${cookieName};if(typeof c==="string"){var p=("; "+document.cookie).split("; "+c+"=");if(p.length>1){v=p.pop().split(";")[0];}}}if(v!=="light"&&v!=="dark"&&v!=="system"){v=${defaultPreference};}if(v==="light"||v==="dark"||v==="system"){document.documentElement.setAttribute("data-theme-mode",v);}}catch(e){var d=${defaultPreference};if(d==="light"||d==="dark"||d==="system"){document.documentElement.setAttribute("data-theme-mode",d);}}})();`;
}
