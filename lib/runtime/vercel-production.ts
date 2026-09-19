type Env = Record<string, string | undefined>;

export function isVercelProduction(env: Env = process.env): boolean {
  return env.VERCEL_ENV === "production";
}
