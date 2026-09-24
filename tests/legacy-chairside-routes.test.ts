import { existsSync, readFileSync } from "node:fs";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { proxy } from "@/proxy";

const REMOVED_ROUTE_FILES = [
  "app/(staff)/sessions/new/page.tsx",
  "app/(staff)/session/[id]/control/page.tsx",
  "app/(staff)/display/[token]/page.tsx",
  "app/(staff)/dashboard/procedures/page.tsx",
  "lib/realtime/publisher.ts",
  "lib/realtime/subscriber.ts",
  "lib/sessions/create-procedure-session.ts",
  "lib/procedures/list-clinic-templates.ts",
] as const;

const LEGACY_PATHS = [
  "/sessions/new",
  "/session/some-id/control",
  "/display/some-token",
  "/dashboard/procedures",
] as const;

function requestFor(url: string): NextRequest {
  const parsed = new URL(url);
  return new NextRequest(url, {
    headers: { host: parsed.host },
  });
}

describe("removed chairside routes", () => {
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;

  beforeEach(() => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
  });

  afterEach(() => {
    if (previousRoot === undefined) {
      delete process.env.CARE_GUIDE_ROOT_DOMAIN;
    } else {
      process.env.CARE_GUIDE_ROOT_DOMAIN = previousRoot;
    }
  });

  it("does not keep chairside route modules or realtime libraries", () => {
    for (const file of REMOVED_ROUTE_FILES) {
      expect(existsSync(file), file).toBe(false);
    }
  });

  it("returns 404 for legacy URLs on marketing and tenant hosts", () => {
    for (const pathname of LEGACY_PATHS) {
      expect(
        proxy(requestFor(`http://localhost:3000${pathname}`)).status,
        `marketing ${pathname}`
      ).toBe(404);
      expect(
        proxy(requestFor(`http://demodental.localhost:3000${pathname}`)).status,
        `tenant ${pathname}`
      ).toBe(404);
    }
  });

  it("does not rewrite legacy staff-host URLs into another product surface", () => {
    const catchAll = readFileSync("app/(staff)/[...slug]/page.tsx", "utf8");
    expect(catchAll).toContain("notFound()");

    for (const pathname of LEGACY_PATHS) {
      const response = proxy(
        requestFor(`http://app.localhost:3000${pathname}`)
      );
      expect(response.status, pathname).toBe(200);
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("does not document Supabase as an application dependency", () => {
    const pkg = readFileSync("package.json", "utf8");
    const example = readFileSync(".env.example", "utf8");
    expect(pkg).not.toContain("@supabase/supabase-js");
    expect(example).not.toMatch(/SUPABASE/);
  });
});
