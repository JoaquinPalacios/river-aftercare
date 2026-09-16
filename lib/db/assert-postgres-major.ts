export const REQUIRED_POSTGRES_MAJOR = 18;

export function postgresMajorFromServerVersion(serverVersion: string): number {
  const major = Number.parseInt(serverVersion, 10);
  if (!Number.isInteger(major) || major <= 0) {
    throw new Error(
      `Could not parse PostgreSQL major version from "${serverVersion}".`
    );
  }
  return major;
}

export function assertPostgresMajor(
  serverVersion: string,
  requiredMajor = REQUIRED_POSTGRES_MAJOR
): void {
  const major = postgresMajorFromServerVersion(serverVersion);
  if (major !== requiredMajor) {
    throw new Error(
      `River Aftercare requires PostgreSQL ${requiredMajor}; connected server reports ${serverVersion}.`
    );
  }
}
