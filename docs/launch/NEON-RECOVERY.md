# Neon production recovery — River Aftercare

Operator runbook for accidental data loss or corruption on the **River Aftercare Production** Neon project. This is not a provisioning guide, not a Prisma migrate procedure, and not a claim of full disaster recovery.

Do **not** run these steps from Cursor, CI, or a documentation pass. Do **not** store connection strings, passwords, or Neon API keys in the repository. Do **not** change Vercel `DATABASE_URL`. Do **not** use production **Restore** / **Proceed to restore** as a test.

Local Docker dump/restore is a different document: [../development/POSTGRES-18-UPGRADE.md](../development/POSTGRES-18-UPGRADE.md). Production schema apply is a different document: [PRODUCTION-MIGRATION.md](PRODUCTION-MIGRATION.md).

## Current production facts

| Surface                     | Recorded value                                                       |
| --------------------------- | -------------------------------------------------------------------- |
| Neon project                | River Aftercare Production                                           |
| Production branch           | `production`                                                         |
| Engine / region             | PostgreSQL **18**, AWS Asia Pacific 2 (Sydney)                       |
| Verified history retention  | **6 hours** (observed 20 September 2026)                             |
| Manual snapshots            | Available                                                            |
| Scheduled snapshots         | Require a plan upgrade. An upgraded plan has **not** been purchased. |
| In-place production restore | **Not tested.** Do not treat it as proven.                           |

Application runtime uses pooled `DATABASE_URL`. Trusted-machine migrations use unpooled `DIRECT_URL`. Neither URL belongs in this runbook.

## What is proven vs not proven

A recovery-readiness drill was completed **manually** on **20 September 2026**. Production was **never** modified. No in-place restore of `production` was performed.

**Proven**

- Restore from history is available on the production branch.
- Preview historic data / historical SQL works (PITR history preview).
- Historical child-branch recovery works.
- The recovered child branch is independently queryable.

The isolated recovery branch exists for **validation only**. It is not a live production rewind.

**Not proven**

- Live production in-place rewind / **Restore** against `production`.
- Scheduled snapshot restore.
- Recovery from an outage older than the currently configured **6-hour** history window.
- Any external or off-provider database backup.

Do **not** describe this as “full disaster recovery proven”.

## Canonical first response

Preferred first response to accidental data loss or corruption:

```text
Incident
  → identify a safe timestamp within the available history window
  → Preview historic data
  → run read-only verification queries
  → create an isolated child branch from that timestamp
  → verify recovered schema and data on that branch
  → determine recovery scope
```

Only then decide between:

- **A.** selectively recovering affected data from the isolated branch into production, or
- **B.** a controlled full production restore if that is genuinely necessary.

Do **not** make “rewind production immediately” the default recovery procedure.

## Production restore warning

Neon console **Restore** / **Proceed to restore** against the `production` branch is a **real production operation**.

- Do not use it for testing, drills, or “just to see what happens”.
- An isolated historical child branch is the preferred recovery-validation method.
- A full production restore requires explicit operator review and a written incident recovery plan.
- Production application connections may be affected by an in-place restore.
- This runbook does **not** claim that an in-place production restore has been tested. It has not.

## History retention limitation

Current verified history retention is **6 hours**.

Recovery from Neon history is only available inside that currently configured window. That is acceptable for the current MVP **only** together with reasonable monitoring and incident detection. A longer retention window should be reconsidered as paying-client data and operational criticality increase.

Do not state that an upgraded Neon plan has been purchased. Scheduled snapshots were observed as requiring a plan upgrade; they were not enabled by this drill.

## Drill record — 20 September 2026

Performed manually against River Aftercare Production. Intentional non-goal: no in-place restore of `production`.

1. Opened Neon → Postgres database → **Backup & Restore**.
2. Confirmed:
   - Restore from history available
   - `production` history window = **6 hours**
   - manual snapshots available
   - scheduled snapshots require a plan upgrade
3. Selected historical production timestamp:

   **20 September 2026, 10:10 AM, Australia/Sydney**

4. Used **Preview historic data**.

   The Browse Data UI initially returned `Error connecting to database: signal is aborted without reason`. That was a Neon console/UI issue. Historical SQL via **Query Data** worked.

5. Historical read-only SQL on that timestamp returned:

   | Relation           | Count |
   | ------------------ | ----: |
   | `User`             |     3 |
   | `Clinic`           |     1 |
   | `ClinicProfile`    |     1 |
   | `ClinicMembership` |     2 |
   | `AccountToken`     |     1 |
   | `auth_sessions`    |     4 |

6. Historical `_prisma_migrations` rows were present and **finished**. Among them:

   - `20260919140000_add_clinic_typeface`
   - `20260919120000_add_account_token`

   No rollback was recorded.

7. Historical schema inspection confirmed `ClinicProfile.typeface` exists as `udt_name = ClinicTypeface`, nullable `YES`.
8. Created isolated child branch **`recovery-drill-2026-09-20`**:
   - Parent: `production`
   - Mode: branch data and schema from a past point in time
   - Timestamp: 20 Sep 2026, 10:10 AM Australia/Sydney
   - Auto-delete: 1 day
9. Connected independently to the recovery branch through the Neon SQL Editor. The recovered branch returned the **same** historical counts as step 5.
10. The recovery branch was deleted manually after verification. **Production was never modified.**

## Read-only verification queries

Run these (or equivalents) against **Preview historic data** and again on the isolated child branch. Read-only. Do not `UPDATE`, `DELETE`, `TRUNCATE`, `DROP`, or run Prisma migrate against a recovery branch unless that is an explicitly planned later step.

```sql
SELECT COUNT(*) AS users FROM "User";
SELECT COUNT(*) AS clinics FROM "Clinic";
SELECT COUNT(*) AS clinic_profiles FROM "ClinicProfile";
SELECT COUNT(*) AS memberships FROM "ClinicMembership";
SELECT COUNT(*) AS account_tokens FROM "AccountToken";
SELECT COUNT(*) AS auth_sessions FROM auth_sessions;

SELECT migration_name, finished_at, rolled_back_at
FROM _prisma_migrations
ORDER BY finished_at;

SELECT column_name, udt_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ClinicProfile'
  AND column_name = 'typeface';
```

Expected at the 20 September 2026 10:10 AM Australia/Sydney timestamp: the counts in the table above; finished migrations including `20260919140000_add_clinic_typeface` and `20260919120000_add_account_token` with no rollback; `ClinicProfile.typeface` present as nullable `ClinicTypeface`.

If Browse Data fails with a console abort, retry historical SQL via Query Data before concluding that history is unavailable.

## Isolated child-branch procedure

1. Confirm the candidate timestamp is still inside the **6-hour** history window (or the window configured at incident time).
2. Preview historic data and run the read-only queries.
3. Create a child branch from `production` using **Branch data and schema from a past point in time** at that timestamp.
4. Give the branch an incident-specific name. Set a short auto-delete window.
5. Open the **child branch** SQL Editor (not the `production` connection). Confirm you are not on `production`.
6. Repeat the read-only queries. Compare schema and counts with the preview.
7. Decide recovery scope (selective copy vs controlled full restore).
8. Delete the child branch when it is no longer needed.

Do not point Vercel Production `DATABASE_URL` at a recovery branch. Do not run `prisma migrate deploy`, `db push`, seed, or `migrate reset` on production as part of a recovery drill.

## After verification: recovery scope

| Option                           | When                                                                                     | Status in this repo                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| A. Selective data recovery       | A bounded set of rows is wrong and a historical copy is enough                           | Preferred once the isolated branch is verified           |
| B. Controlled production restore | The production branch itself must be rewound, after operator review and an incident plan | **Not tested.** Last resort only. See the warning above. |

Selective recovery still needs an incident-specific plan (which tables, which keys, how to avoid overwriting newer valid writes). This document does not invent that SQL.

## What not to do

- Do not rewind `production` to test this runbook.
- Do not treat a 6-hour window as off-site backup.
- Do not assume scheduled snapshots exist.
- Do not claim recovery is possible for incidents discovered after history has expired.
- Do not connect this runbook to application deploys, Prisma schema changes, or Vercel env edits.
