import { afterEach, describe, expect, it, vi } from "vitest";

const pingMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/health/ping-application-database", () => ({
  pingApplicationDatabase: pingMock,
}));

import { GET, HEAD } from "@/app/api/health/route";
import {
  HEALTH_CACHE_CONTROL,
  HEALTH_DATABASE_UNAVAILABLE_EVENT,
  HEALTH_OK_BODY,
  HEALTH_UNAVAILABLE_BODY,
} from "@/lib/health/contract";

function requestFor(url: string, host: string, method = "GET") {
  return new Request(url, {
    method,
    headers: { host },
  });
}

describe("GET /api/health", () => {
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;

  afterEach(() => {
    pingMock.mockReset();
    if (previousRoot === undefined) {
      delete process.env.CARE_GUIDE_ROOT_DOMAIN;
    } else {
      process.env.CARE_GUIDE_ROOT_DOMAIN = previousRoot;
    }
  });

  it("returns 404 off the staff host without probing the database", async () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    const marketing = await GET(
      requestFor("http://localhost:3000/api/health", "localhost:3000")
    );
    const tenant = await GET(
      requestFor(
        "http://demodental.localhost:3000/api/health",
        "demodental.localhost:3000"
      )
    );

    expect(marketing.status).toBe(404);
    expect(tenant.status).toBe(404);
    expect(await marketing.text()).toBe("");
    expect(await tenant.text()).toBe("");
    expect(pingMock).not.toHaveBeenCalled();
  });

  it("returns HTTP 200 and the exact safe body when the database ping succeeds", async () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    pingMock.mockResolvedValue(undefined);
    const response = await GET(
      requestFor("http://app.localhost:3000/api/health", "app.localhost:3000")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(HEALTH_OK_BODY);
    expect(Object.keys(body)).toEqual(["status"]);
    expect(response.headers.get("cache-control")).toBe(HEALTH_CACHE_CONTROL);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(JSON.stringify(body).toLowerCase()).not.toMatch(
      /prisma|neon|postgres|database_url|direct_url|vercel/
    );
  });

  it("returns HTTP 503 and the generic body when the database ping fails", async () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    pingMock.mockRejectedValue(
      new Error("P1001 Can't reach database server at neon.example:5432")
    );

    const response = await GET(
      requestFor(
        "http://app.localhost:3000/api/health?verbose=1",
        "app.localhost:3000"
      )
    );
    const raw = await response.text();
    const body = JSON.parse(raw) as unknown;

    expect(response.status).toBe(503);
    expect(body).toEqual(HEALTH_UNAVAILABLE_BODY);
    expect(raw.toLowerCase()).not.toContain("p1001");
    expect(raw.toLowerCase()).not.toContain("neon.example");
    expect(raw.toLowerCase()).not.toContain("postgres");
    expect(raw.toLowerCase()).not.toContain("prisma");
    expect(info).toHaveBeenCalledWith({
      event: HEALTH_DATABASE_UNAVAILABLE_EVENT,
    });
    expect(JSON.stringify(info.mock.calls)).not.toContain("neon.example");
    info.mockRestore();
  });

  it("does not require cookies, auth, or query-dependent database work", async () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    pingMock.mockResolvedValue(undefined);
    const response = await GET(
      new Request("http://app.localhost:3000/api/health?clinic=demodental", {
        headers: {
          host: "app.localhost:3000",
          cookie: "authjs.session-token=secret-session",
        },
      })
    );

    expect(response.status).toBe(200);
    expect(pingMock).toHaveBeenCalledOnce();
    expect(pingMock.mock.calls[0]).toEqual([]);
  });

  it("supports HEAD with the same status and cache header", async () => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    pingMock.mockResolvedValue(undefined);
    const response = await HEAD(
      requestFor(
        "http://app.localhost:3000/api/health",
        "app.localhost:3000",
        "HEAD"
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(HEALTH_CACHE_CONTROL);
    expect(await response.text()).toBe("");
  });
});
