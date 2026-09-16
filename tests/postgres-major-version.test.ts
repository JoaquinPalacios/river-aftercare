import "dotenv/config";

import { afterAll, describe, expect, it } from "vitest";

import { assertPostgresMajor } from "@/lib/db/assert-postgres-major";
import { getPrisma } from "@/lib/prisma";

const prisma = getPrisma();

describe("PostgreSQL major contract", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("runs integration tests against PostgreSQL 18", async () => {
    const rows = await prisma.$queryRaw<Array<{ server_version: string }>>`
      SHOW server_version
    `;
    expect(rows[0]?.server_version).toBeTruthy();
    assertPostgresMajor(rows[0].server_version);
    expect(rows[0].server_version.startsWith("18")).toBe(true);
  });
});
