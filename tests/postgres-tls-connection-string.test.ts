import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import dns from "node:dns";
import net from "node:net";
import { dirname, join } from "node:path";

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { prismaCliDatabaseUrl } from "@/lib/db/prisma-cli-database-url";

const require = createRequire(import.meta.url);
const pgPackagePath = require.resolve("pg/package.json");
const pgRequire = createRequire(pgPackagePath);
const connectionStringEntry = pgRequire.resolve("pg-connection-string");

type SslSettings = {
  rejectUnauthorized?: boolean;
  checkServerIdentity?: unknown;
};

type ParsedPostgresUrl = {
  host?: string | null;
  port?: string | null;
  user?: string;
  password?: string;
  database?: string | null;
  ssl?: boolean | SslSettings;
  sslmode?: string;
  schema?: string;
  channel_binding?: string;
  application_name?: string;
  uselibpqcompat?: string;
};

type PgConnectionParameters = {
  user?: string;
  password?: string;
  host: string;
  port: number;
  database?: string;
  ssl: false | SslSettings;
};

const parse = pgRequire("pg-connection-string").parse as (
  connectionString: string
) => ParsedPostgresUrl;

const ConnectionParameters = pgRequire("./lib/connection-parameters") as new (
  config: string | { connectionString: string }
) => PgConnectionParameters;

const POOLED =
  "postgresql://app:example-password@ep-example-pooler.ap-southeast-2.aws.neon.tech:5432/neondb?sslmode=verify-full&channel_binding=require&schema=public&application_name=river-aftercare";
const DIRECT =
  "postgresql://app:example-password@ep-example.ap-southeast-2.aws.neon.tech:5432/neondb?sslmode=verify-full&channel_binding=require&schema=public&application_name=river-aftercare";
const LOCAL =
  "postgresql://postgres:postgres@localhost:5432/care_guide?schema=public";

const socketConnect = vi.spyOn(net.Socket.prototype, "connect");
const dnsLookup = vi.spyOn(dns, "lookup");

afterEach(() => {
  socketConnect.mockClear();
  dnsLookup.mockClear();
});

afterAll(() => {
  socketConnect.mockRestore();
  dnsLookup.mockRestore();
});

function packageVersion(packageJsonPath: string): string {
  const version = JSON.parse(readFileSync(packageJsonPath, "utf8")).version;
  if (typeof version !== "string") {
    throw new Error("Package version is missing.");
  }
  return version;
}

function warningsFrom(run: () => void): string[] {
  const spy = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
  try {
    run();
    return spy.mock.calls.map((call) => String(call[0]));
  } finally {
    spy.mockRestore();
  }
}

function assertStrictTls(
  ssl: ParsedPostgresUrl["ssl"]
): asserts ssl is SslSettings {
  expect(ssl).toEqual({});
  expect(ssl).not.toBe(false);
  if (!ssl || typeof ssl !== "object") {
    throw new Error("TLS settings were not an object.");
  }
  expect(ssl.rejectUnauthorized).not.toBe(false);
  expect(ssl).not.toHaveProperty("checkServerIdentity");
}

describe("installed PostgreSQL TLS parser", () => {
  it("uses pg 8 with pg-connection-string 2.14 or newer", () => {
    const pgVersion = packageVersion(pgPackagePath);
    const connectionStringVersion = packageVersion(
      join(dirname(connectionStringEntry), "package.json")
    );
    const [connectionMajor, connectionMinor] = connectionStringVersion
      .split(".")
      .map(Number);

    expect(pgVersion.startsWith("8.")).toBe(true);
    expect(connectionMajor).toBe(2);
    expect(connectionMinor).toBeGreaterThanOrEqual(14);
  });

  it("parses sslmode=verify-full without a compatibility warning or a socket", () => {
    let parsed: ParsedPostgresUrl | undefined;
    let fromString: PgConnectionParameters | undefined;
    let fromConfig: PgConnectionParameters | undefined;

    const warnings = warningsFrom(() => {
      parsed = parse(POOLED);
      fromString = new ConnectionParameters(POOLED);
      fromConfig = new ConnectionParameters({ connectionString: POOLED });
    });

    expect(warnings).toEqual([]);
    expect(socketConnect).not.toHaveBeenCalled();
    expect(dnsLookup).not.toHaveBeenCalled();
    if (!parsed || !fromString || !fromConfig) {
      throw new Error("Parser did not return a configuration.");
    }

    assertStrictTls(parsed.ssl);
    assertStrictTls(fromString.ssl);
    assertStrictTls(fromConfig.ssl);
    expect(parsed.sslmode).toBe("verify-full");
    expect(parsed.user).toBe("app");
    expect(parsed.password).toBe("example-password");
    expect(parsed.host).toBe("ep-example-pooler.ap-southeast-2.aws.neon.tech");
    expect(parsed.port).toBe("5432");
    expect(parsed.database).toBe("neondb");
    expect(parsed.channel_binding).toBe("require");
    expect(parsed.schema).toBe("public");
    expect(parsed.application_name).toBe("river-aftercare");
    expect(parsed.uselibpqcompat).toBeUndefined();
    expect(fromString.host).toBe(parsed.host);
    expect(fromString.port).toBe(5432);
    expect(fromString.user).toBe("app");
    expect(fromString.password).toBe("example-password");
    expect(fromString.database).toBe("neondb");
    expect(fromConfig.host).toBe(fromString.host);
    expect(fromConfig.ssl).toEqual(fromString.ssl);
  });

  it("keeps require equivalent to verify-full and reports the compatibility warning", () => {
    const current = parse(POOLED);
    const legacyUrl = POOLED.replace("sslmode=verify-full", "sslmode=require");
    let legacy: ParsedPostgresUrl | undefined;

    const warnings = warningsFrom(() => {
      legacy = parse(legacyUrl);
    });

    expect(warnings.join("\n")).toMatch(/SECURITY WARNING/);
    expect(warnings.join("\n")).toMatch(/sslmode=verify-full/);
    expect(warnings.join("\n")).toMatch(/uselibpqcompat=true/);
    if (!legacy) {
      throw new Error("Legacy parser result is missing.");
    }
    expect(legacy.sslmode).toBe("require");
    assertStrictTls(legacy.ssl);
    const { sslmode: currentMode, ...currentRest } = current;
    const { sslmode: legacyMode, ...legacyRest } = legacy;
    expect(currentMode).toBe("verify-full");
    expect(legacyMode).toBe("require");
    expect(legacyRest).toEqual(currentRest);
  });

  it("treats uselibpqcompat require as disabled certificate verification", () => {
    const insecure = parse(
      POOLED.replace(
        "sslmode=verify-full",
        "uselibpqcompat=true&sslmode=require"
      )
    );

    expect(insecure.ssl).toMatchObject({ rejectUnauthorized: false });
    expect(parse(POOLED).ssl).not.toMatchObject({
      rejectUnauthorized: false,
    });
  });
});

describe("Neon and local connection roles", () => {
  it("keeps pooled runtime and direct migration URLs on verify-full", () => {
    const pooled = parse(POOLED);
    const direct = parse(DIRECT);

    expect(POOLED.startsWith("postgresql://")).toBe(true);
    expect(DIRECT.startsWith("postgresql://")).toBe(true);
    expect(pooled.host).toContain("-pooler.");
    expect(pooled.host?.endsWith(".neon.tech")).toBe(true);
    expect(direct.host).toBe("ep-example.ap-southeast-2.aws.neon.tech");
    expect(direct.host).not.toContain("pooler");
    expect(pooled.sslmode).toBe("verify-full");
    expect(direct.sslmode).toBe("verify-full");
    expect(prismaCliDatabaseUrl({ DATABASE_URL: POOLED })).toBe(POOLED);
    expect(
      prismaCliDatabaseUrl({
        DATABASE_URL: POOLED,
        DIRECT_URL: DIRECT,
      })
    ).toBe(DIRECT);
    expect(socketConnect).not.toHaveBeenCalled();
    expect(dnsLookup).not.toHaveBeenCalled();
  });

  it("leaves the local Docker URL without sslmode", () => {
    const parsed = parse(LOCAL);
    const parameters = new ConnectionParameters(LOCAL);
    const example = readFileSync(".env.example", "utf8");
    const localAssignment = example
      .split("\n")
      .find((line) => line.startsWith("DATABASE_URL="));

    expect(parsed.sslmode).toBeUndefined();
    expect(parsed.ssl).toBeUndefined();
    expect(parsed.host).toBe("localhost");
    expect(parsed.database).toBe("care_guide");
    expect(parsed.schema).toBe("public");
    expect(parameters.ssl).toBe(false);
    expect(localAssignment).toBe(`DATABASE_URL="${LOCAL}"`);
    expect(readFileSync("compose.yaml", "utf8")).not.toContain("sslmode");
    expect(socketConnect).not.toHaveBeenCalled();
  });
});

describe("repository TLS contract", () => {
  it("passes the runtime connection string through without weakening TLS", () => {
    const sources = [
      "lib/prisma.ts",
      "prisma.config.ts",
      "prisma/seed.mjs",
      "e2e/helpers/prisma.ts",
      "e2e/helpers/e2e-database.ts",
    ];

    for (const sourcePath of sources) {
      const source = readFileSync(sourcePath, "utf8");
      expect(source).not.toContain("rejectUnauthorized");
      expect(source).not.toContain("sslmode=no-verify");
      expect(source).not.toContain("uselibpqcompat");
    }

    expect(readFileSync("lib/prisma.ts", "utf8")).toContain("connectionString");
  });

  it("documents verify-full for Neon and the manual rollout", () => {
    const migration = readFileSync(
      "docs/launch/PRODUCTION-MIGRATION.md",
      "utf8"
    );

    expect(migration).toContain("sslmode=verify-full");
    expect(migration).toContain("Do not add `DIRECT_URL` to Vercel");
    expect(migration).toContain("sslmode=no-verify");
    expect(migration).toContain("rejectUnauthorized: false");
    expect(migration).toContain("uselibpqcompat=true");
    expect(migration).toContain("### Preview");
    expect(migration).toContain("### Production");
    expect(migration).toContain("### Trusted-machine migrations");
    expect(migration).toContain("### Rollback");
    expect(migration).toContain("pnpm prod:db:status");
    expect(migration).toContain("sslmode=require");
    expect(readFileSync(".env.example", "utf8")).toContain(
      "sslmode=verify-full"
    );
  });
});
