import { notFound } from "next/navigation";

/**
 * Published guides are a single public slug (`/[guideSlug]`). Nested tenant
 * paths such as `/extraction/unknown` have no page; call `notFound()` so the
 * patient 404 renders instead of the framework default. `/[guideSlug]/print`
 * stays a more specific static segment.
 */
export default function UnmatchedTenantNestedPage() {
  notFound();
}
