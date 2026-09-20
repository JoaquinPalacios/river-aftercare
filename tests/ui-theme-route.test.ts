import { afterEach, describe, expect, it } from "vitest";

import {
  PORTAL_THEME_STORAGE_KEY,
  PRODUCT_THEME_COOKIE_NAME,
} from "@/lib/branding/theme-preference";
import { GET } from "@/app/api/ui-theme/route";

function requestFor(url: string, host: string) {
  return new Request(url, {
    headers: { host },
  });
}

describe("GET /api/ui-theme", () => {
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;

  afterEach(() => {
    if (previousRoot === undefined) {
      delete process.env.CARE_GUIDE_ROOT_DOMAIN;
    } else {
      process.env.CARE_GUIDE_ROOT_DOMAIN = previousRoot;
    }
  });

  it("returns 404 off the staff host", async () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    const response = await GET(
      requestFor(
        "http://localhost:3000/api/ui-theme?preference=dark",
        "localhost:3000"
      )
    );
    expect(response.status).toBe(404);
  });

  it("rejects an unsafe preference", async () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    const response = await GET(
      requestFor(
        "http://app.localhost:3000/api/ui-theme?preference=javascript:alert(1)",
        "app.localhost:3000"
      )
    );
    expect(response.status).toBe(400);
  });

  it("sets a host-only product theme cookie on the staff host", async () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    const response = await GET(
      requestFor(
        "http://app.localhost:3000/api/ui-theme?preference=dark",
        "app.localhost:3000"
      )
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${PRODUCT_THEME_COOKIE_NAME}=dark`);
    expect(setCookie.toLowerCase()).not.toContain("domain=");
    const html = await response.text();
    expect(html).toContain(PORTAL_THEME_STORAGE_KEY);
    expect(html).toContain('"dark"');
    expect(html).not.toContain("javascript:");
  });
});
