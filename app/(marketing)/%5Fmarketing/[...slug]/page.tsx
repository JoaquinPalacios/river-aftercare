import { notFound } from "next/navigation";

/**
 * Multiple root layouts do not apply `(marketing)/not-found.tsx` to unmatched
 * URLs. The hostname proxy rewrites unknown apex paths to `/_marketing/...`;
 * this catch-all calls `notFound()` so the marketing 404 renders.
 */
export default function UnmatchedMarketingPage() {
  notFound();
}
