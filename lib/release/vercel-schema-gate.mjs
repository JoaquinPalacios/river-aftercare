/**
 * @param {NodeJS.Dict<string | undefined>} env
 * @returns {{ run: boolean, reason: "not-production" | "skipped" | "production" }}
 */
export function shouldRunVercelProductionSchemaGate(env) {
  if (env.VERCEL_ENV !== "production") {
    return { run: false, reason: "not-production" };
  }
  if (env.SKIP_PRODUCTION_SCHEMA_GATE === "1") {
    return { run: false, reason: "skipped" };
  }
  return { run: true, reason: "production" };
}

/**
 * @param {string} output
 * @returns {"up-to-date" | "pending" | "unrecognized"}
 */
export function interpretMigrateStatusOutput(output) {
  const text = output ?? "";
  const pending =
    /have not yet been applied/i.test(text) ||
    /following migrations? have not yet been applied/i.test(text) ||
    /not yet been applied/i.test(text);
  const upToDate =
    /schema is up to date/i.test(text) ||
    /database is in sync/i.test(text) ||
    /no pending migrations/i.test(text);

  if (pending) {
    return "pending";
  }
  if (upToDate) {
    return "up-to-date";
  }
  return "unrecognized";
}
