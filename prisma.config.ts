import "dotenv/config";
import { defineConfig } from "prisma/config";

import { prismaCliDatabaseUrl } from "./lib/db/prisma-cli-database-url";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON prisma/seed.mjs",
  },
  datasource: {
    // Local Docker: DATABASE_URL only. Production CLI prefers DIRECT_URL
    // (unpooled Neon) when set; runtime PrismaPg still uses DATABASE_URL.
    // Production migrate helpers unset ambient URLs and load only
    // .env.neon-production — never rely on this config to select production
    // by itself. See docs/launch/PRODUCTION-MIGRATION.md.
    url: prismaCliDatabaseUrl(),
  },
});
