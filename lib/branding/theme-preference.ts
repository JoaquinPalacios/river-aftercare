export const THEME_PREFERENCES = ["system", "light", "dark"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const CLINIC_THEME_MODES = ["LIGHT", "DARK", "SYSTEM"] as const;

export type ClinicThemeMode = (typeof CLINIC_THEME_MODES)[number];

export const MARKETING_THEME_STORAGE_KEY = "aftercare-guide-marketing-theme";
export const PATIENT_THEME_STORAGE_KEY = "aftercare-guide-patient-theme";
export const PORTAL_THEME_STORAGE_KEY = "aftercare-guide-portal-theme";
export const PRODUCT_THEME_COOKIE_NAME = "aftercare-guide-ui-theme";
export const PRODUCT_THEME_COOKIE_MAX_AGE = 31_536_000;
export const PRODUCT_THEME_SYNC_PATH = "/api/ui-theme";
export const PRODUCT_THEME_QUERY_PARAM = "ui-theme";
const LOCALHOST_THEME_SYNC_MS = 1_000;

export type ThemePreferenceBootstrapOptions = {
  fallbackStorageKey?: string;
  cookieName?: string;
  defaultPreference?: ThemePreference;
  queryParam?: string;
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
): Promise<void> {
  document.documentElement.setAttribute("data-theme-mode", preference);
  if (options?.productCookie) {
    return persistProductThemeCookie(preference);
  }
  return Promise.resolve();
}

export function persistProductThemeCookie(
  preference: ThemePreference
): Promise<void> {
  if (typeof document === "undefined") {
    return Promise.resolve();
  }

  const domain = document.documentElement.getAttribute(
    "data-theme-cookie-domain"
  );
  let cookie = `${PRODUCT_THEME_COOKIE_NAME}=${preference}; Path=/; Max-Age=${PRODUCT_THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
  if (typeof location !== "undefined" && location.protocol === "https:") {
    cookie += "; Secure";
  }
  if (domain) {
    document.cookie = `${cookie}; Domain=${domain}`;
  }
  document.cookie = cookie;
  stampStaffLoginLinks(preference);
  return syncProductThemeToStaffOrigin(preference);
}

function stampStaffLoginLinks(preference: ThemePreference): void {
  if (typeof document === "undefined") {
    return;
  }

  for (const node of document.querySelectorAll("a[href]")) {
    if (!(node instanceof HTMLAnchorElement)) {
      continue;
    }

    let url: URL;
    try {
      url = new URL(node.href, location.href);
    } catch {
      continue;
    }

    if (url.pathname !== "/login") {
      continue;
    }

    url.searchParams.set(PRODUCT_THEME_QUERY_PARAM, preference);
    node.href = url.toString();
  }
}

function resolveLocalhostStaffOrigin(): string | null {
  if (typeof location === "undefined") {
    return null;
  }

  const hostname = location.hostname;
  if (hostname !== "localhost" && !hostname.endsWith(".localhost")) {
    return null;
  }

  const port = location.port ? `:${location.port}` : "";
  return `${location.protocol}//app.localhost${port}`;
}

function syncProductThemeToStaffOrigin(
  preference: ThemePreference
): Promise<void> {
  if (typeof document === "undefined") {
    return Promise.resolve();
  }

  const domain = document.documentElement.getAttribute(
    "data-theme-cookie-domain"
  );
  const staffOrigin = resolveLocalhostStaffOrigin();
  if (
    domain !== ".localhost" ||
    !staffOrigin ||
    staffOrigin === location.origin
  ) {
    return Promise.resolve();
  }

  const url = `${staffOrigin.replace(/\/$/, "")}${PRODUCT_THEME_SYNC_PATH}?preference=${encodeURIComponent(preference)}`;

  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.title = "Theme preference sync";
    frame.style.cssText =
      "position:absolute;width:0;height:0;border:0;clip:rect(0 0 0 0);overflow:hidden";
    let settled = false;
    const done = () => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      frame.remove();
      resolve();
    };
    const timer = window.setTimeout(done, LOCALHOST_THEME_SYNC_MS);
    frame.addEventListener("load", done);
    frame.addEventListener("error", done);
    document.body.appendChild(frame);
    frame.src = url;
  });
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
  const queryParam = JSON.stringify(options?.queryParam ?? null);
  const maxAge = JSON.stringify(PRODUCT_THEME_COOKIE_MAX_AGE);
  return `(function(){try{var v;var qp=${queryParam};var q=typeof qp==="string"?new URLSearchParams(location.search).get(qp):null;if(q==="light"||q==="dark"||q==="system"){v=q;try{localStorage.setItem(${key},v);}catch(e){}var qc=${cookieName};if(typeof qc==="string"){document.cookie=qc+"="+v+"; Path=/; Max-Age="+${maxAge}+"; SameSite=Lax";}try{var u=new URL(location.href);u.searchParams.delete(qp);history.replaceState(null,"",u.pathname+u.search+u.hash);}catch(e){}}else{v=localStorage.getItem(${key});if(v!=="light"&&v!=="dark"&&v!=="system"){var f=${fallback};if(typeof f==="string"){v=localStorage.getItem(f);}}if(v!=="light"&&v!=="dark"&&v!=="system"){var c=${cookieName};if(typeof c==="string"){var p=("; "+document.cookie).split("; "+c+"=");if(p.length>1){v=p.pop().split(";")[0];}}}if(v!=="light"&&v!=="dark"&&v!=="system"){v=${defaultPreference};}}if(v==="light"||v==="dark"||v==="system"){document.documentElement.setAttribute("data-theme-mode",v);}}catch(e){var d=${defaultPreference};if(d==="light"||d==="dark"||d==="system"){document.documentElement.setAttribute("data-theme-mode",d);}}})();`;
}
