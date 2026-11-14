import { definePrismaConfig } from "prisma/config";
import {
  defineConfig as definePostgresConfig,
  prisma7Schema,
} from "@prisma/orm-postgres/config";

const connection =
  process.env.PRISMA8_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

export default definePrismaConfig({
  parent: false,
  orm: definePostgresConfig({
    contract: prisma7Schema("../../prisma/schema.prisma"),
    output: "generated",
    db: {
      connection,
    },
  }),
});
