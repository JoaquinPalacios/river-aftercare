import { notFound } from "next/navigation";

/**
 * Multiple root layouts do not apply `(staff)/not-found.tsx` to unmatched
 * URLs. This catch-all is lower-priority than static staff pages and route
 * handlers (`/login`, `/api/health`, …) and exists only to invoke the staff
 * 404 for unknown app-host paths.
 */
export default function UnmatchedStaffPage() {
  notFound();
}
