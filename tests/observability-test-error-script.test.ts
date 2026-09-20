import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const SCRIPT = "scripts/observability-test-error.mjs";

describe("observability:test-error script", () => {
  it("is a CLI-only verifier and refuses CI or a missing DSN", () => {
    const source = readFileSync(SCRIPT, "utf8");
    expect(source).toContain('environment: "verification"');
    expect(source).toContain("river_aftercare_error_tracking_verification");
    expect(source).not.toMatch(/app\/api|debug\/error|NEXT_PUBLIC_/);
    expect(source).not.toContain("DATABASE_URL");
    expect(source).toContain("sendDefaultPii: false");
    expect(source).toContain("tracesSampleRate: 0");

    const env = { ...process.env };
    delete env.VITEST;
    delete env.CI;

    const missing = spawnSync(process.execPath, [SCRIPT], {
      encoding: "utf8",
      env: {
        ...env,
        BETTER_STACK_ERROR_DSN: "",
      },
    });
    expect(missing.status).not.toBe(0);
    expect(`${missing.stdout}\n${missing.stderr}`).toMatch(
      /BETTER_STACK_ERROR_DSN is required/
    );

    const ci = spawnSync(process.execPath, [SCRIPT], {
      encoding: "utf8",
      env: {
        ...process.env,
        CI: "true",
        BETTER_STACK_ERROR_DSN:
          "https://examplePublicKey@o0.ingest.example.test/0",
      },
    });
    expect(ci.status).not.toBe(0);
    expect(`${ci.stdout}\n${ci.stderr}`).toMatch(/Refusing to send/);
  });
});
