import { createRequire } from "node:module";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);

function prismaDriverModulesLoaded(): string[] {
  return Object.keys(require.cache).filter((key) =>
    /[/\\]@prisma[/\\]client[/\\]|[/\\]\.prisma[/\\]client[/\\]|[/\\]pg[/\\]lib[/\\]/.test(
      key
    )
  );
}

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

describe("proxy retired-tenant module initialisation", () => {
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

  it("evaluates Prisma only after a tenant host requests the retired-slug lookup", async () => {
    expect(prismaDriverModulesLoaded()).toEqual([]);

    const { proxy } = await import("@/proxy");
    expect(prismaDriverModulesLoaded()).toEqual([]);

    const staff = await proxy(
      requestFor("http://app.localhost:3000/dashboard")
    );
    const health = await proxy(
      requestFor("http://app.localhost:3000/api/health")
    );
    const marketing = await proxy(requestFor("http://localhost:3000/"));
    const assets = await proxy(requestFor("http://assets.localhost:3000/"));

    expect(staff.status).toBe(200);
    expect(rewrittenPath(staff)).toBeNull();
    expect(health.status).toBe(200);
    expect(rewrittenPath(marketing)).toBe("/_marketing");
    expect(assets.status).toBe(404);
    expect(prismaDriverModulesLoaded()).toEqual([]);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const slug = "proxy-import-probe";
    const response = await proxy(
      requestFor(`http://${slug}.localhost:3000/extraction`)
    );
    const body = await response.text();
    const rewritten = rewrittenPath(response);

    expect(
      prismaDriverModulesLoaded().some((key) => key.includes("@prisma/client"))
    ).toBe(true);
    expect(body).not.toContain("other-clinic");
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(
      /postgres:\/\/|DATABASE_URL/
    );

    if (response.status === 410) {
      expect(body).toBe("This aftercare page is no longer available.");
      expect(rewritten).toBeNull();
      expect(warn).not.toHaveBeenCalled();
    } else {
      expect(response.status).toBe(200);
      expect(rewritten).toBe(`/_sites/${slug}/extraction`);
    }

    warn.mockRestore();
  });
});
