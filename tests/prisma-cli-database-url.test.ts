import { describe, expect, it } from "vitest";

import { prismaCliDatabaseUrl } from "@/lib/db/prisma-cli-database-url";

const LOCAL =
  "postgresql://postgres:postgres@localhost:5432/care_guide?schema=public";
const DIRECT =
  "postgresql://app:secret@ep-example.ap-southeast-2.aws.neon.tech/neondb?sslmode=require";

describe("prismaCliDatabaseUrl", () => {
  it("uses DATABASE_URL when DIRECT_URL is unset", () => {
    expect(prismaCliDatabaseUrl({ DATABASE_URL: LOCAL })).toBe(LOCAL);
  });

  it("prefers DIRECT_URL when both are set", () => {
    expect(
      prismaCliDatabaseUrl({
        DATABASE_URL: LOCAL,
        DIRECT_URL: DIRECT,
      })
    ).toBe(DIRECT);
  });

  it("ignores a blank DIRECT_URL", () => {
    expect(
      prismaCliDatabaseUrl({
        DATABASE_URL: LOCAL,
        DIRECT_URL: "  ",
      })
    ).toBe(LOCAL);
  });
});
