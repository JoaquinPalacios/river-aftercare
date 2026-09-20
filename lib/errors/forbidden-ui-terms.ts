/** Substrings that must never appear in user-facing failure UI. */
export const FORBIDDEN_FAILURE_UI_TERMS = [
  "prisma",
  "p2022",
  "postgresql",
  "postgres",
  "neon",
  "vercel",
  "digest",
  "stack trace",
  "econnrefused",
  "direct_url",
  "database_url",
  "server component",
] as const;

export function findForbiddenFailureUiTerms(text: string): string[] {
  const haystack = text.toLowerCase();
  return FORBIDDEN_FAILURE_UI_TERMS.filter((term) => haystack.includes(term));
}
