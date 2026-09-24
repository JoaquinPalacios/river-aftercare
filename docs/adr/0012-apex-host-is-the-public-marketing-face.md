# ADR 0012 — Apex host is the public marketing face

- **Status:** Accepted
- **Date:** 2026-09-06
- **PRD:** [../product/PRD.md](../product/PRD.md) §§10.10, 11.2, 18.5

## Context

Phase 1B treated both the apex host and `app.<root>` as staff. That was a temporary local-testing convenience. It made the staff workspace the first thing anyone saw on `localhost`.

The intended public positioning is:

```text
<platform-domain>                  public marketing homepage
app.<platform-domain>              staff (chairside routes later removed)
<tenant>.<platform-domain>         patient aftercare
```

## Decision

Classify the apex/root hostname as **marketing**. Keep `app.<root>` as **staff**. Tenant hostnames stay patient aftercare.

The marketing homepage is rewritten internally to `/_marketing`, and `/pricing` / `/contact` rewrite to `/_marketing/pricing` and `/_marketing/contact`. Direct `/_marketing` access is blocked on every public host. `/sitemap.xml` and `/robots.txt` pass through on the marketing host only.

Staff paths (`/login`, `/dashboard`, `/sessions`, `/session`, `/display`, `/api/auth`) are not served on the apex host. They remain on `app.<root>`.

The marketing surface has its own root layout and CSS. It must not import staff Tailwind or patient aftercare styles.

## Consequences

- Local `http://localhost:<port>/` is the product homepage.
- Local `http://localhost:<port>/pricing` and `/contact` are platform sales pages.
- Local `http://app.localhost:<port>/` keeps the internal staff workspace, login, and dashboard. Retired chairside URLs 404.
- Tenant routing is unchanged. Tenant `/pricing` and `/contact` are not platform sales pages.
- Later cookie, CORS, and host configuration must keep staff cookies off the marketing and tenant hosts.

## Notes for later implementation

Do not merge operator admin into the marketing homepage. Do not serve tenant aftercare from the apex host.
