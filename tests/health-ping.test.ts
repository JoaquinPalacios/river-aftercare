import "dotenv/config";

import { afterAll, describe, expect, it } from "vitest";

import { pingApplicationDatabase } from "@/lib/health/ping-application-database";
import { getPrisma } from "@/lib/prisma";

const prisma = getPrisma();

describe("application database health ping", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("reads through the pooled Prisma client without touching application tables", async () => {
    await expect(pingApplicationDatabase()).resolves.toBeUndefined();
  });
});
