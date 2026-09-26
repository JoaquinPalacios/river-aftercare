import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const environment = JSON.parse(
  readFileSync(".cursor/environment.json", "utf8")
) as {
  install?: string;
  start?: string;
  build?: { dockerfile?: string };
};

const dockerfile = readFileSync(".cursor/Dockerfile", "utf8");
const install = readFileSync("scripts/cursor-cloud-install.sh", "utf8");
const start = readFileSync("scripts/cursor-cloud-start.sh", "utf8");
const gitignore = readFileSync(".gitignore", "utf8");
const agents = readFileSync("AGENTS.md", "utf8");

describe("Cursor Cloud environment contract", () => {
  it("tracks only the Cloud definition under .cursor", () => {
    expect(gitignore).toContain(".cursor/*");
    expect(gitignore).toContain("!.cursor/environment.json");
    expect(gitignore).toContain("!.cursor/Dockerfile");
    expect(environment.build?.dockerfile).toBe("Dockerfile");
    expect(environment.install).toContain("scripts/cursor-cloud-install.sh");
    expect(environment.start).toContain("scripts/cursor-cloud-start.sh");
  });

  it("does not copy the repository or bake credentials into the image", () => {
    expect(dockerfile).not.toMatch(/^\s*COPY\s+/m);
    expect(dockerfile).not.toContain("AUTH_SECRET=");
    expect(dockerfile).not.toContain("CLOUD_ADMIN_PASSWORD");
    expect(dockerfile).not.toContain("neon.tech");
    expect(JSON.stringify(environment)).not.toContain("neon.tech");
    expect(JSON.stringify(environment)).not.toContain("AUTH_SECRET");
  });

  it("keeps migrations and seeds out of install and on the local deploy path", () => {
    expect(install).not.toContain("migrate deploy");
    expect(install).not.toContain("db:seed");
    expect(install).not.toContain("db push");
    expect(install).not.toContain("migrate reset");
    expect(install).toContain("postgres:18-alpine");
    expect(install).toContain("pnpm install --frozen-lockfile");

    expect(start).toContain("prisma migrate deploy --config prisma.config.ts");
    expect(start).toContain("pnpm db:seed");
    expect(start).toContain("pg_isready -U postgres -d care_guide");
    expect(start).not.toContain("db push");
    expect(start).not.toContain("migrate reset");
    expect(start).not.toContain("prod:db");
    expect(start).toContain(
      'inspect(databaseUrl, "DATABASE_URL", "care_guide", true)'
    );
    expect(start).toContain("care_guide_e2e");
    expect(start).toContain("DIRECT_URL");
    expect(start).toContain("address=/localhost/127.0.0.1");
    expect(start).not.toContain("/etc/hosts");
  });

  it("documents the Cloud maintenance contract for future agents", () => {
    expect(agents).toContain("Cursor Cloud maintenance contract");
    expect(agents).toContain(
      "Cursor Cloud environment reviewed; no update required."
    );
    expect(agents).toContain("docs/development/CURSOR-CLOUD.md");
    const guide = readFileSync("docs/development/CURSOR-CLOUD.md", "utf8");
    expect(guide).toContain("Maintenance contract");
    expect(guide).toContain(".cursor/environment.json");
    expect(guide).toContain("CLOUD_ADMIN_PASSWORD");
    expect(guide).not.toMatch(/CLOUD_ADMIN_PASSWORD=.+/);
    expect(guide).toContain("CARE_GUIDE_METADATA_BASE=http://localhost:4173");
    expect(guide).toContain(".next-e2e");
    expect(start).not.toContain("CARE_GUIDE_METADATA_BASE");
    expect(start).not.toContain("CARE_GUIDE_E2E_BUILD");
    const e2eServer = readFileSync("scripts/e2e-next-server.sh", "utf8");
    expect(e2eServer).toContain("CARE_GUIDE_METADATA_BASE=");
    expect(e2eServer).toContain("next build");
    expect(e2eServer).toContain("next start");
    const playwright = readFileSync("playwright.config.ts", "utf8");
    expect(playwright).toContain("scripts/e2e-next-server.sh");
    expect(playwright).toContain("CARE_GUIDE_E2E_BUILD");
    expect(playwright).toContain(
      "CARE_GUIDE_METADATA_BASE: `http://localhost:${E2E_PORT}`"
    );
  });
});
