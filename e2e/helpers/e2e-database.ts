import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Client } from "pg";

import { assertPostgresMajor } from "../../lib/db/assert-postgres-major";
import {
  developmentDatabaseUrl,
  e2eDatabaseUrl,
  maintenanceDatabaseUrl,
  parseDatabaseUrl,
} from "./database";

export const DEV_GUIDE_SNAPSHOT_PATH =
  "test-results/dev-practice-guides.snapshot.json";

export interface PracticeGuideSnapshotRow {
  id: string;
  title: string;
  publicSlug: string;
  status: string;
  updatedAt: string;
}

function quoteIdent(value: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe database identifier: ${value}`);
  }
  return `"${value}"`;
}

export async function ensureE2eDatabase(): Promise<string> {
  const e2eUrl = e2eDatabaseUrl();
  const { database } = parseDatabaseUrl(e2eUrl);
  const versionAdapter = new PrismaPg({
    connectionString: developmentDatabaseUrl(),
  });
  const versionPrisma = new PrismaClient({ adapter: versionAdapter });
  try {
    const rows = await versionPrisma.$queryRaw<
      Array<{ server_version: string }>
    >`SHOW server_version`;
    assertPostgresMajor(rows[0]?.server_version ?? "");
  } finally {
    await versionPrisma.$disconnect();
  }
  const client = new Client({
    connectionString: maintenanceDatabaseUrl(e2eUrl),
  });
  await client.connect();
  try {
    const existing = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [database]
    );
    if (!existing.rowCount) {
      await client.query(`CREATE DATABASE ${quoteIdent(database)}`);
    }
  } finally {
    await client.end();
  }
  return e2eUrl;
}

export function applyE2eSchema(e2eUrl: string): void {
  const env = { ...process.env, DATABASE_URL: e2eUrl };
  execFileSync(
    "pnpm",
    ["exec", "prisma", "migrate", "deploy", "--config", "prisma.config.ts"],
    { env, stdio: "inherit" }
  );
  execFileSync(
    "pnpm",
    ["exec", "prisma", "db", "seed", "--config", "prisma.config.ts"],
    { env, stdio: "inherit" }
  );
}

export async function snapshotPracticeGuides(
  connectionString: string
): Promise<PracticeGuideSnapshotRow[]> {
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });
  try {
    const rows = await prisma.practiceGuide.findMany({
      select: {
        id: true,
        title: true,
        publicSlug: true,
        status: true,
        updatedAt: true,
      },
      orderBy: { id: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      publicSlug: row.publicSlug,
      status: row.status,
      updatedAt: row.updatedAt.toISOString(),
    }));
  } finally {
    await prisma.$disconnect();
  }
}

export async function writeDevelopmentGuideSnapshot(): Promise<void> {
  const rows = await snapshotPracticeGuides(developmentDatabaseUrl());
  mkdirSync(dirname(DEV_GUIDE_SNAPSHOT_PATH), { recursive: true });
  writeFileSync(
    DEV_GUIDE_SNAPSHOT_PATH,
    `${JSON.stringify(rows, null, 2)}\n`,
    "utf8"
  );
}
