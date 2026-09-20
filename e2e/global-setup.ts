import { mkdir } from "node:fs/promises";
import path from "node:path";

import {
  assertLocalhostTenantsResolve,
  seedPhase1eFixtures,
} from "./fixtures/phase1e-data";
import {
  applyE2eSchema,
  ensureE2eDatabase,
  writeDevelopmentGuideSnapshot,
} from "./helpers/e2e-database";
import { e2ePrisma } from "./helpers/prisma";

const E2E_ASSET_ROOT = path.join(process.cwd(), ".data", "clinic-assets-e2e");

export default async function globalSetup(): Promise<void> {
  await mkdir(E2E_ASSET_ROOT, { recursive: true });
  await writeDevelopmentGuideSnapshot();
  const e2eUrl = await ensureE2eDatabase();
  applyE2eSchema(e2eUrl);
  await assertLocalhostTenantsResolve();
  await seedPhase1eFixtures();
  await e2ePrisma.$disconnect();
}
