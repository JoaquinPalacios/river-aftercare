import { mkdir, rmdir } from "node:fs/promises";
import path from "node:path";

const LOCK_DIR = path.join(
  process.cwd(),
  ".data",
  "clinic-assets-e2e",
  ".demo-branding.lock"
);

export async function acquireDemoBrandingLock(): Promise<void> {
  await mkdir(path.dirname(LOCK_DIR), { recursive: true });
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      await mkdir(LOCK_DIR);
      return;
    } catch (error) {
      if (!(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "EEXIST"
      )) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("Timed out waiting for the demo branding lock.");
}

export async function releaseDemoBrandingLock(): Promise<void> {
  await rmdir(LOCK_DIR).catch(() => undefined);
}
