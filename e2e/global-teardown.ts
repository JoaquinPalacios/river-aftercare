import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";

import {
  DEV_GUIDE_SNAPSHOT_PATH,
  type PracticeGuideSnapshotRow,
  snapshotPracticeGuides,
} from "./helpers/e2e-database";
import { developmentDatabaseUrl } from "./helpers/database";
import { cleanupPhase1eFixtures } from "./fixtures/phase1e-data";
import { e2ePrisma } from "./helpers/prisma";

const E2E_ASSET_ROOT = path.join(process.cwd(), ".data", "clinic-assets-e2e");

export default async function globalTeardown(): Promise<void> {
  await cleanupPhase1eFixtures();
  await e2ePrisma.$disconnect();
  await rm(E2E_ASSET_ROOT, { recursive: true, force: true });

  const before = JSON.parse(
    readFileSync(DEV_GUIDE_SNAPSHOT_PATH, "utf8")
  ) as PracticeGuideSnapshotRow[];
  const after = await snapshotPracticeGuides(developmentDatabaseUrl());
  const beforeIds = before.map((row) => row.id).join(",");
  const afterIds = after.map((row) => row.id).join(",");
  if (beforeIds !== afterIds) {
    const added = after.filter(
      (row) => !before.some((existing) => existing.id === row.id)
    );
    throw new Error(
      `E2E mutated the development database. Added guides: ${JSON.stringify(added)}`
    );
  }
}
