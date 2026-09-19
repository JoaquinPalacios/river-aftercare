# Agentic readiness — River Aftercare

Audit of the **current repository architecture** against [Is Agentic](https://is-agentic.com/) methodology (Essential / Recommended / Emerging). This is not a production score. Is Agentic only scores a publicly reachable URL; do not submit authenticated or private previews.

Do not implement features solely to game a score. Recommended API/MCP/GraphQL checks are **not applicable** until River Aftercare actually exposes those capabilities.

## Applicable checks

| Check                                     | Result           | Notes                                                                                                                                               |
| ----------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server-rendered meaningful content        | PASS             | Marketing, About, tenant guides, and operator SEO are Server Components.                                                                            |
| JavaScript independence for core reading  | PASS             | Marketing and patient documents remain readable with JS disabled. Marketing motion has a noscript fallback.                                         |
| Semantic landmarks                        | PASS             | `header` / `nav` / `main` / `footer` on marketing; staff/operator use `aside` + `main`.                                                             |
| Semantic buttons/links                    | PASS             | Native `a` / `button`; operator copy control is a labelled button.                                                                                  |
| Accessible names                          | PASS             | Logo `aria-label`, nav labels, form labels.                                                                                                         |
| Keyboard usage                            | PASS             | Focus-visible rings; mobile nav popover supports Escape.                                                                                            |
| Real HTTP status codes                    | PASS             | Proxy 404s unknown marketing/tenant hosts; unpublished guides `notFound()`.                                                                         |
| Real 404                                  | PASS             | HTTP 404. Marketing unknown paths currently return an empty 404 body from the proxy (status is still 404).                                          |
| HTTP redirects                            | PASS             | Unauthenticated staff routes redirect to `/login`.                                                                                                  |
| Canonical                                 | PASS             | Derived from origin + route on marketing; tenant canonical mirrors Host.                                                                            |
| `lang`                                    | PASS             | `lang="en"` on marketing, staff, and aftercare roots.                                                                                               |
| Titles / descriptions                     | PASS             | Configurable marketing metadata with code fallbacks.                                                                                                |
| Open Graph                                | PASS             | Title/description/url; images only when a dedicated path is configured.                                                                             |
| Structured data                           | PASS             | Generated JSON-LD, factual fields only.                                                                                                             |
| Sitemap                                   | PASS             | Marketing only, real canonical URLs.                                                                                                                |
| robots.txt                                | PASS             | Allows public marketing; disallows internal prefixes. Metadata noindex remains the authority for private pages.                                     |
| llms.txt                                  | PASS             | `/llms.txt` generated from product identity and public routes.                                                                                      |
| llms-full.txt                             | GAP              | Skipped. Six public pages are still below the threshold for a second full-text dump.                                                                |
| Clear site/product purpose                | PASS             | Homepage, About, and llms.txt state what River Aftercare is.                                                                                        |
| “When to use” agent guidance              | PASS             | `/llms.txt` includes a when-to-use section.                                                                                                         |
| Trust / contact pages                     | PASS             | About, Contact, Privacy, and Terms exist. Public legal copy is published without draft banners; operator legal-approval flags remain a launch gate. |
| Authenticated surfaces                    | PASS             | Staff/operator/preview are noindex and behind auth.                                                                                                 |
| Public API / GraphQL / MCP / Agent Skills | N/A              | Not a product capability. Do not add for scoring.                                                                                                   |
| robots/CDN blocking legitimate agents     | POST-DEPLOY TEST | Turnstile, Cloudflare bot fight, and future CDN rules must not block ordinary retrieval of public HTML, sitemap, robots, or llms.txt.               |

## Future API / MCP triggers

Only mark those Is Agentic checks applicable when one of these is real:

- a public clinic integration API
- practice-management-system integration
- external agents publishing or reading structured guides
- an automation ecosystem that needs a stable machine contract

Until then, keep extracting **modules**, not a public agent API. See [APPLICATION.md](../architecture/APPLICATION.md).

## Post-deployment public scan

The numeric Is Agentic score cannot be trusted until River Aftercare has a public URL.

1. Deploy a **public** staging or production hostname with no private patient or operator data on the apex.
2. Confirm `/`, `/pricing`, `/contact`, `/about`, `/llms.txt`, `/robots.txt`, and `/sitemap.xml` are reachable without auth.
3. Do **not** submit `app.` hosts, tenant guides with demo PII (there should be none), or authenticated previews.
4. Run [https://is-agentic.com/](https://is-agentic.com/) against the public origin (or `npx is-agentic <domain>`).
5. Record the score and failed **applicable** Essential checks.
6. Fix substantive gaps (content, HTTP, semantics, trust pages). Do not add MCP/API/skills solely to raise the number.
7. Rescan the same public URL after fixes.

Do not claim an Is Agentic production score from this local phase.
