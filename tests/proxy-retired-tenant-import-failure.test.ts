import { readFileSync } from "node:fs";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tenancy/retired-tenant-proxy", () => {
  throw new Error("postgres://secret@db.internal:5432/care_guide");
});

import { proxy } from "@/proxy";

function requestFor(url: string): NextRequest {
  const parsed = new URL(url);
  return new NextRequest(url, {
    headers: { host: parsed.host },
  });
}

function rewrittenPath(response: Response): string | null {
  const rewrite =
    response.headers.get("x-middleware-rewrite") ??
    response.headers.get("x-nextjs-rewrite");
  return rewrite ? new URL(rewrite).pathname : null;
}

describe("proxy retired-tenant import failure", () => {
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

  it("keeps the dynamic import inside the tenant branch", () => {
    const source = readFileSync("proxy.ts", "utf8");
    const tenantBranch = source.indexOf('classification.kind === "tenant"');
    const specifier = '"@/lib/tenancy/retired-tenant-proxy"';

    expect(tenantBranch).toBeGreaterThan(0);
    expect(source.slice(0, tenantBranch)).not.toContain(specifier);
    expect(source.slice(tenantBranch)).toContain("await import(");
    expect(source.slice(tenantBranch)).toContain(specifier);
    expect(source).not.toMatch(
      /import\s*\{[^}]*retiredTenantProxyResponse[^}]*\}\s*from\s*["']@\/lib\/tenancy\/retired-tenant-proxy["']/
    );
    expect(source).not.toContain("getPrisma");
    expect(source).not.toContain("@prisma/client");
  });

  it("rewrites only the requested tenant when the retired-tenant module fails to load", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const response = await proxy(
      requestFor("http://riverside.localhost:3000/extraction")
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(rewrittenPath(response)).toBe("/_sites/riverside/extraction");
    expect(body).not.toContain("secret");
    expect(body).not.toContain("postgres");
    expect(body).not.toContain("other-clinic");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toBe(
      "[tenancy] retired_tenant_lookup_failed"
    );
    expect(warn.mock.calls[0]?.[1]).toEqual({ name: "Error" });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("postgres");

    warn.mockClear();
    const staff = await proxy(requestFor("http://app.localhost:3000/login"));
    const marketing = await proxy(requestFor("http://localhost:3000/pricing"));
    const unrelated = await proxy(
      requestFor("http://clinic.example/extraction")
    );

    expect(staff.status).toBe(200);
    expect(rewrittenPath(staff)).toBeNull();
    expect(rewrittenPath(marketing)).toBe("/_marketing/pricing");
    expect(unrelated.status).toBe(404);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
