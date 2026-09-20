#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  evaluatePrismaReleaseChange,
  formatPrismaReleaseReport,
  mergeFileChanges,
  parseGitNameStatus,
  prismaReleaseExitCode,
} from "../lib/release/prisma-migration-gate.mjs";

function printHelp() {
  console.log(`Detect Prisma schema/migration changes in a git range.

Usage:
  pnpm release:check
  node scripts/release-check.mjs [--base <ref>] [--head <ref>]

Defaults:
  --base  $RELEASE_CHECK_BASE, otherwise origin/main, otherwise main
  --head  HEAD

This check does not connect to any database and does not need production
credentials. It fails closed on schema-without-migration, missing SQL,
rewritten historical migrations, and unreviewed destructive SQL.
`);
}

function parseArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { help: true };
  }

  let base;
  let head = "HEAD";
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base") {
      base = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--head") {
      head = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { help: false, base, head };
}

function git(args, cwd) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  });
}

function gitOutput(args, cwd, label) {
  const result = git(args, cwd);
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`${label} failed${detail ? `: ${detail}` : "."}`);
  }
  return result.stdout;
}

function isUsableGitRef(ref) {
  const value = ref?.trim() ?? "";
  return value.length > 0 && !/^0+$/.test(value);
}

function resolveDefaultBase(cwd) {
  if (isUsableGitRef(process.env.RELEASE_CHECK_BASE)) {
    return process.env.RELEASE_CHECK_BASE.trim();
  }
  const originMain = git(["rev-parse", "--verify", "origin/main"], cwd);
  if (originMain.status === 0) {
    return "origin/main";
  }
  const main = git(["rev-parse", "--verify", "main"], cwd);
  if (main.status === 0) {
    return "main";
  }
  throw new Error(
    "Could not resolve a base ref. Pass --base or set RELEASE_CHECK_BASE."
  );
}

function collectChanges(base, head, cwd) {
  const committed = parseGitNameStatus(
    gitOutput(
      ["diff", "--name-status", `${base}...${head}`],
      cwd,
      `git diff ${base}...${head}`
    )
  );
  const staged = parseGitNameStatus(
    gitOutput(["diff", "--name-status", "--cached"], cwd, "git diff --cached")
  );
  const unstaged = parseGitNameStatus(
    gitOutput(["diff", "--name-status"], cwd, "git diff")
  );
  return mergeFileChanges([committed, staged, unstaged]);
}

function emitGitHubAnnotations(evaluation) {
  if (process.env.GITHUB_ACTIONS !== "true") {
    return;
  }
  if (evaluation.prismaChanged) {
    console.log(
      "::warning title=Prisma release::Production schema change detected. Automatic Production deployments from main stay enabled. After merge, the Production schema gate is expected to block the new build while migrations are pending. Review and apply with prod:db:*, verify, then redeploy the same merged SHA. Vercel does not run migrate deploy."
    );
  }
  for (const error of evaluation.errors) {
    console.log(`::error title=${error.code}::${error.message}`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }

  const cwd = process.cwd();
  const base = options.base ?? resolveDefaultBase(cwd);
  const head = options.head ?? "HEAD";
  const changes = collectChanges(base, head, cwd);
  const evaluation = evaluatePrismaReleaseChange({
    changes,
    readFile(filePath) {
      try {
        return readFileSync(resolve(cwd, filePath), "utf8");
      } catch {
        return null;
      }
    },
  });

  console.log(formatPrismaReleaseReport(evaluation));
  emitGitHubAnnotations(evaluation);
  return prismaReleaseExitCode(evaluation);
}

try {
  process.exit(main());
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
