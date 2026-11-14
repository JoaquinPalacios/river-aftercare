import { createRequire } from "node:module";

import { contractFromJson } from "@prisma/orm-postgres/static";
import postgres from "@prisma/orm-postgres/runtime";

import contractJson from "./generated/contract.json" with { type: "json" };

const databaseUrl = process.env.PRISMA8_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("PRISMA8_DATABASE_URL is required.");
}

const require = createRequire(new URL("../../package.json", import.meta.url));
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const contract = contractFromJson(contractJson);
const db = postgres({ contract, url: databaseUrl });
const prisma7 = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const stamp = `prisma8-probe-${Date.now()}@example.test`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

try {
  const [prisma8Totals, prisma7Count] = await Promise.all([
    db.orm.public.User.aggregate((aggregate) => ({
      totalUsers: aggregate.count(),
    })),
    prisma7.user.count(),
  ]);
  const prisma8Count = prisma8Totals.totalUsers;
  assert(
    prisma8Count === prisma7Count,
    `User counts differ: Prisma 8 ${prisma8Count}, Prisma 7 ${prisma7Count}`
  );

  const page = await db.orm.public.User.orderBy((user) => user.email.asc())
    .limit(2)
    .offset(0)
    .all();
  assert(page.length <= 2, "limit did not cap the page");

  const before = prisma8Count;
  await db
    .transaction(async (tx) => {
      await tx.orm.public.User.create({ email: stamp });
      throw new Error("rollback-probe");
    })
    .catch((error) => {
      if (error?.message !== "rollback-probe") {
        throw error;
      }
    });
  assert(
    (
      await db.orm.public.User.aggregate((aggregate) => ({
        totalUsers: aggregate.count(),
      }))
    ).totalUsers === before,
    "rolled-back create changed the User count"
  );

  const created = await db.orm.public.User.create({ email: stamp });
  assert(created.email === stamp, "created user email did not match");
  const withMemberships = await db.orm.public.User.where({ id: created.id })
    .include("memberships")
    .first();
  assert(withMemberships !== null, "created user was not readable");
  assert(
    Array.isArray(withMemberships.memberships),
    "membership relation was not loaded"
  );

  let uniqueState = "";
  try {
    await db.orm.public.User.create({ email: stamp });
  } catch (error) {
    uniqueState = error?.sqlState ?? "";
  }
  assert(
    uniqueState === "23505",
    "duplicate email did not fail as unique_violation"
  );

  await db.orm.public.User.where({ id: created.id }).delete();
  const gone = await prisma7.user.findUnique({ where: { id: created.id } });
  assert(gone === null, "Prisma 7 still reads the deleted user");

  console.log(
    JSON.stringify({
      userCount: prisma8Count,
      pageSize: page.length,
      uniqueViolation: uniqueState,
      rollbackPreservedCount: true,
      relationInclude: true,
      prisma7AgreesAfterDelete: true,
    })
  );
} finally {
  await prisma7.$disconnect();
  if (typeof db.close === "function") {
    await db.close();
  }
}
