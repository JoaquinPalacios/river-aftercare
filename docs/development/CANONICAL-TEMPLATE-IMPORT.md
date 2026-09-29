# Canonical template draft import

Import creates or fills ordinary **DRAFT** revisions from structured JSON. It is a local authoring tool for the initial River template library and later controlled bulk updates.

Import is not a publisher, a replacement for `/operator/templates`, or a production data migration.

## Invariant

Import may create or populate canonical drafts. Import can never publish a canonical revision.

An imported draft still goes through Operator Templates: inspect or edit, Save, then Publish. The importer has no `reviewed`, `approved`, `publish`, `published`, `reviewerName`, `reviewedAt`, or `publishedAt` operation.

## Command

Dry-run is the default. Nothing is written unless `--apply` is present.

Production import creates drafts only. Publication still happens in Operator Templates with Save, then Publish.

```bash
pnpm canonical-template:import -- fixtures/canonical-template-import/example-physio.json
pnpm canonical-template:import -- --operator-email operator@example.com fixtures/canonical-template-import/example-physio.json
pnpm canonical-template:import -- --apply --operator-email operator@example.com fixtures/canonical-template-import/example-physio.json
pnpm canonical-template:import -- --apply --allow-production --confirm-draft-import --operator-email operator@example.com content/canonical-templates
```

Requires Node.js 24.

### Local

A local target is a loopback host (`localhost`, `127.0.0.1`, `::1`, `0.0.0.0`, or a `*.localhost` name) and a process whose `VERCEL_ENV` is not `production` or `preview`. Dry-run is the default. `--apply` plus `--operator-email` writes drafts.

### Remote or production

Any other database host is `PRODUCTION / REMOTE`. `VERCEL_ENV=production` and `VERCEL_ENV=preview` are also `PRODUCTION / REMOTE`, even on a loopback URL. A `neon.tech` hostname is remote. It is not treated as proof that the database is production, because Neon branches can be non-production, and it is not treated as safe to write.

Dry-run may connect and read. It prints `Target: PRODUCTION / REMOTE — DRY RUN — NO WRITES` and does not require the write flags.

`--apply` by itself never writes to a remote or production database. Apply needs all of:

- `--apply`
- `--operator-email` for an existing Operator
- `--allow-production`
- `--confirm-draft-import`

There is no interactive prompt. Before the first write, the command prints the target class, `APPLY — DRAFTS ONLY`, the Operator email, the payload count, and each slug and mode. It does not print the connection string or section bodies.

`--operator-email` must match one existing user whose `platformRole` is `OPERATOR`. Dry-run checks that user when the flag is present. The command never picks the first Operator, a seed user, or the shell user.

A directory imports only its top-level `.json` files, in filename order. It does not recurse. Each file is its own transaction. One invalid or failed file does not roll back the others, and a failed file leaves none of that file's import committed. Passing a directory is not production consent. The same two production flags cover the whole batch. There is no all-or-nothing batch mode.

Pass file and flag arguments after `--` so pnpm forwards them. A bare `--` is ignored.

## Schema version

Every payload sets `schemaVersion` to `1`. Any other value, including a missing version or the string `"1"`, is rejected. Older payloads are not reinterpreted.

## Modes

`upsert` is not a mode.

### `create`

Creates a production template and draft v1, then fills that draft.

- Requires `title`, `slug`, and `serviceCategory`.
- The slug must not already exist.
- Cannot create a sample and cannot use the slug `extraction`.

In one transaction, calls `createCanonicalTemplateInTransaction`, then `saveCanonicalTemplateDraftInTransaction`. The public `createCanonicalTemplate` service uses the same create operation.

### `create-revision`

Opens the next draft on a published production template and replaces the cloned content with the payload.

- The template must exist, must not be a sample, must have a published revision, and must not already have an open draft.
- `serviceCategory` must match the stored category. Import does not change it.
- `title` is optional. When present, it must match the stored title. Import does not change it.

In one transaction, locks the template, calls `createCanonicalTemplateDraftInTransaction`, then `saveCanonicalTemplateDraftInTransaction`. The public draft service uses the same open-draft operation. The published revision is not edited. If the content write fails, the new draft is not committed.

### `update-draft`

Replaces the content of the one open draft.

- The template must exist and must have exactly one `DRAFT` revision.
- A published revision with no open draft is refused. Use `create-revision`.
- Identity rules match `create-revision`.

In one transaction, locks the template and calls `saveCanonicalTemplateDraftInTransaction`. The public `saveCanonicalTemplateDraft` service uses that same operation. A content change does not clear historical review columns, and the report does not mention review. Import still does not publish.

## Payload

Array order is the only order. Do not send `sortOrder`. The importer assigns `sortOrder` before it calls the lifecycle service.

Section and instruction keys are required, stable, and unique within their parent. Keys are lowercase URL segments, such as `introduction` or `exercise-frequency`. The importer does not invent keys.

`serviceCategory` is `DENTAL`, `PHYSIOTHERAPY`, `CHIROPRACTIC`, or `COSMETIC_AESTHETIC`.

`kind` is the canonical guide grammar, not a profession-specific set:

`INTRODUCTION`, `IMMEDIATE_CARE`, `FIRST_24_HOURS`, `RECOVERY_TIMELINE`, `WHAT_IS_NORMAL`, `PAIN`, `RESTRICTIONS`, `MEDICATIONS`, `SITE_CARE`, `WHAT_TO_AVOID`, `WARNING_SIGNS`, `CONTACT_PRACTICE`, `EMERGENCY`, `CUSTOM`, `HOME_CARE_PLAN`.

Field lengths, timeline ranges, timeline overlap, frequency and duration pairs, and section and home-care limits are the same rules as the Operator draft editor. A `HOME_CARE_PLAN` needs at least one instruction. Other sections need a non-empty `body`. A home-care plan may use `""` for `body`. Instructions may omit `body`.

Frequency uses `frequencyCount` with `frequencyPeriod` `DAY` or `WEEK`. Duration uses `durationValue` with `durationUnit` `DAYS` or `WEEKS`. Send both halves of a pair, or neither. There is no adherence, completion, patient, or notification field.

Home-care instructions are allowed only on `HOME_CARE_PLAN`.

### Forbidden fields

The schema rejects these keys anywhere in the payload. They are not ignored.

- `isSample`, `isActive`, `status`
- `reviewerName`, `reviewerCredential`, `reviewNote`, `reviewedAt`, `reviewRecordedByUserId`
- `publishedAt`, `publishedByUserId`, `createdByUserId`
- `deactivatedAt`, `deactivatedByUserId`
- `reviewed`, `approved`, `publish`, `published`
- `id`, `templateId`, `revisionId`, `guideTemplateId`, `version`
- `sortOrder`, `upsert`

There is no HTTP upload route. Operator Templates remains the human lifecycle UI.

## Sample protection

`extraction` is refused for `create`, `create-revision`, and `update-draft`. Any `isSample` template is refused. The demo bootstrap remains the only writer of that sample. `tooth-extraction` is a legal future slug and is not created by this phase.

## What a write does

Content is validated before the transaction starts. Each payload then commits in one transaction, or commits nothing:

- `create` creates the production template, draft v1, and imported sections together.
- `create-revision` opens the next draft and replaces its cloned sections together. The published revision is not updated.
- `update-draft` replaces the open draft. It does not publish, and it does not clear historical review columns.

A failure inside the transaction rolls back. The importer does not compensate with `abandonCanonicalTemplateDraft`. That operation remains the Operator action for discarding a draft on purpose.

One file does not roll back another file. Audit fields come from the lifecycle service. `createdByUserId` on a draft opened by import is the resolved Operator. Review and publication columns stay empty on `create` and `create-revision`. The production flags do not add review, publication, activation, or sample edits.

## Authoring workflow

1. Author schema version 1 JSON. Use synthetic copy until a real template is deliberately written.
2. Dry-run the file or directory.
3. Correct the reported validation and lifecycle errors.
4. Apply with `--apply` and `--operator-email`.
5. Open `/operator/templates`.
6. Edit the draft and Save.
7. Publish in Operator Templates.

Save persists the editable draft. Publish is the release. Drafts stay hidden from clinics until published.

### Procedure-recovery timeline

For procedure-recovery templates such as Tooth Extraction, Wisdom Tooth Removal, and Dental Implant Placement, prefer this structure:

- Standalone `Immediate care`
- Recovery timeline stages, normally starting with `First 24 hours`, then Days 2–3, Days 4–7, and later stages as appropriate

`First 24 hours` therefore normally belongs inside the Recovery timeline. This is an authoring convention. Do not delete the `FIRST_24_HOURS` section kind, and do not rewrite existing template rows to match it.

Import ends at step 4.

## Synthetic example

`fixtures/canonical-template-import/example-physio.json` is placeholder copy for a Physiotherapy category. It is not clinical guidance. Future real drafts belong in `content/canonical-templates/`. That directory does not contain clinical templates yet.

```json
{
  "schemaVersion": 1,
  "mode": "create",
  "template": {
    "title": "Example placeholder template",
    "slug": "example-placeholder",
    "serviceCategory": "PHYSIOTHERAPY"
  },
  "revision": {
    "sections": []
  }
}
```

Replace `sections` with the real section objects. The fixture file shows an introduction, one timeline stage, and a home-care plan.
