import "dotenv/config";
import { defineConfig } from "prisma/config";

import { prismaCliDatabaseUrl } from "./lib/db/prisma-cli-database-url";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.mjs",
  },
  datasource: {
    // Local Docker: DATABASE_URL only. Later Neon: DIRECT_URL = unpooled
    // migrate/seed connection; runtime PrismaPg still uses DATABASE_URL.
    url: prismaCliDatabaseUrl(),
  },
});
