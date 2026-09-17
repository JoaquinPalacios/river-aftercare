# Application architecture — River Aftercare MVP

The launch backend and application remain a **Next.js App Router monolith**.

Do **not** introduce NestJS, `apps/api`, a REST façade, or a second authenticated API service before a concrete extraction trigger exists.

## What stays in Next.js

| Layer                             | Role                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| App Router routes                 | Hosts, layouts, Server Components, metadata. Launch indexing policy: [SEO.md](SEO.md).      |
| Server Actions / server functions | Authorize, validate input, call a domain module, map the result                             |
| Prisma 7 + PostgreSQL 18          | Persistence. Local Docker and tests use major 18. Production target is Neon PG18 (Sydney).  |
| Domain modules                    | Guides, publication, practice configuration, authorization, operator queries, asset storage |

Patient tenant rendering, clinic portal, and operator console share this process. That avoids a second deployment, session propagation across a network boundary, DTO duplication, CORS, and extra monitoring for a workload that does not need it yet.

## Domain modules today

Business rules should not live only inside React components. Current server modules include:

| Concern                 | Module area                                                           |
| ----------------------- | --------------------------------------------------------------------- |
| Guide lifecycle         | `lib/clinic-portal/*-practice-guide.ts`                               |
| Practice configuration  | `lib/clinic-portal/update-practice-settings.ts`                       |
| Authorization           | `lib/auth/require-*.ts`, `lib/clinic-assets/authorize-clinic-logo.ts` |
| Operator clinic queries | `lib/operator/list-operator-clinics.ts`                               |
| Platform SEO            | `lib/seo/*`                                                           |
| Logo storage boundary   | `lib/clinic-assets/*`                                                 |
| Platform SEO assets     | `lib/platform-assets/*`                                               |

Route handlers and Server Actions should generally: authorize → validate → call the module → map the result.

## Extraction triggers

Evaluate a separate API service (NestJS or otherwise) only when one of these is real:

- a public API for third parties
- a native / mobile app that cannot use this App Router
- substantial third-party integrations that need their own contract
- substantial async workloads that do not fit Server Actions
- independent backend scaling or a dedicated backend team
- external agents publishing or reading structured guides (MCP / public agent APIs)

Until then, keep extracting **modules**, not processes. Do not add MCP, GraphQL, or a public API solely to look agentic.
