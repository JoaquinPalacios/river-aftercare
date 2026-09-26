# Account split

Operator-only preparation and execution for moving one ClinicSite off a Group Account onto a new shell Account.

## Implemented

- Preparation records, destination shell, site decisions, staff intent, and dry-run readiness
- One open preparation per source Account
- Canonical `clinic-account-structure` locks, including deterministic multi-account order
- Atomic execution of one prepared Site split (`executeClinicAccountSplit`)
- Guide and revision copies with `ClinicAccountSplitGuideMap` and `ClinicAccountSplitRevisionMap`
- Placement delete/reinsert that keeps placement ids and public slugs
- Source primary promotion, `DEACTIVATE`, and `RETAIN_ON_SOURCE`
- Compatibility `Clinic.slug` preflight, including an `xsp` park when two Accounts must exchange slugs
- `ClinicProfile` mirror from the post-execution primary Site
- Destination-only membership move and session revocation for those users
- Operator execution UI on a `READY_TO_EXECUTE` preparation
- Idempotent return of the persisted completed result

## Still not implemented

- Multi-account login or session Account selection
- Group → Practice Stripe conversion, source plan change, or guide deletion (PR C)
- Copying or deleting R2 objects
- Moving outstanding source invitations
- Merging into a populated Account

`READY_TO_EXECUTE` means this specific Site split can execute. It does not mean the source Account is ready to become Practice. `practiceDowngradeReady` is reported after execution and does not change the source subscription. `COMPLETED` is written only as the last step of the execution transaction.

## V1 limits

One user cannot be active in both the source and destination Accounts. A preparation is not ready when `keepOnSource` and `grantOnDestination` are both true. Multi-account auth is a separate project.

The destination needs an administrator who will not remain an active source member. There is no operator impersonation path for legal acceptance or Checkout. If the customer cannot name that person, the split stays not ready.

A preparation splits one Site onto a **new** shell Account. It does not split into an existing populated Account, merge Accounts, or enter another customer's Account. Only one non-terminal preparation may be open for a source Account. A second split is created after execution marks the first `COMPLETED`.

Every Site other than the kept Site has an explicit decision:

- `SPLIT` — exactly one. This is the Site that would move.
- `DEACTIVATE` — would become inactive on the source.
- `RETAIN_ON_SOURCE` — stays on the source and stays active if it is active now. A later preparation can split it.

Example: sites A, B, and C. Preparation 1 keeps A, splits B, and retains C. After execution the source Group is A + C and the destination Practice is B. A later preparation can keep A and split C. The source commercial plan is still not changed here.

The kept Site can be any active Site. It does not have to be primary already. If the current primary Site would be split or deactivated, the dry run sets `primaryPromotionRequired` and names the future primary, normally the kept Site. Preparation does not change that flag. Execution promotes it in the same transaction as the Site move. If the current primary stays on the source and remains valid, no promotion is needed.

Practice capacity is one **active** Site. Inactive historical Sites may remain.

Guides left on the source are not deleted. If they would exceed Practice guide limits, or if a guide would lose every placement, readiness says so. The operator fixes that with the existing guide tools.

Public patient URLs are the Site slug, location slug, and guide slug. The preview states **PUBLIC URLS WILL NOT CHANGE** when those values are consistent. Branding objects stay at their current source-Account R2 keys.

The execution phrase is `split {siteSlug}`, using the SPLIT Site slug loaded from the preparation. The operator types it. Surrounding whitespace is ignored. Any other value, including the Account name or the Site display name, performs no writes.

Email stays outside the database transaction and outside readiness. Successful delivery is not a prerequisite.

`targetSourcePlan` is Practice for preview only. Source Stripe subscription, source commercial plan, and Group catalog price are unchanged. Group → Practice billing is a later change, after this structure is proven. The current Stripe catalog has no Group price, and the upgrade/downgrade engines reject Group.

## Destination shell

`createSplitDestinationAccount` creates `Clinic` and `ClinicProfile` only. It does not create `ClinicSite`, `ClinicLocation`, `PracticeGuide`, or `PracticeGuidePlacement`. It does not copy Stripe customers, subscriptions, schedules, checkout ids, billing attempts, entitlement extras, legal acceptance, account tokens, or a source downgrade preparation.

The shell `Clinic.slug` matches `xsp` plus 8 hex characters. Allocation checks both `Clinic.slug` and `ClinicSite.slug`. The slug is not written to `ClinicSite`, so it is not a patient hostname. Execution replaces that compatibility slug using the sequential-split rule below. The shell may have zero Sites. Its name uses the split Site's display name so the operator can recognise it. That does not mean the Site has moved. Do not re-run the historical multi-location site backfill against a shell. That statement inserts a Site for every Clinic that has none, which would turn the compatibility slug into a patient hostname.

## Status

Allowed projection, always from current data:

`DRAFT` → `DESTINATION_READY` → `AWAITING_PAYMENT` → `BILLING_READY` → `READY_TO_EXECUTE`

`CANCELLED` is available before execution. `COMPLETED` is reserved. A later read can move readiness backward when the source, destination, guides, staff, or billing no longer pass. Counts are not trusted from an old preview.

`READY_TO_EXECUTE` requires split integrity and destination commercial readiness. It does not require the source to have only one active Site. The post-split structural check asks whether the source would stay consistent after this operation: a deterministic future primary, an active root location on every site that would stay active, placements that still belong to this Account, and valid memberships. A missing future primary blocks the split.

`practiceDowngradeReady` is a separate dry-run result, with `practiceDowngradeBlockers`. It asks whether the source would also meet Practice limits after this operation: one active Site, location allowance, team allowance, and guide allowances. Retained active Sites make it false and leave the source on Group. Those Practice limits do not block the split. The source commercial plan is not mutated. A later preparation, after this one is `COMPLETED`, can split a retained Site.

`BILLING_READY` requires the destination's local projection: entitlement `ACTIVE`, billing `ACTIVE`, the preparation's plan and interval, no scheduled cancellation or scheduled plan change, and location allowance enough for the active locations on the moving Site. The dry run does not call Stripe.

## Destination admin and billing

The shell has zero Sites. The existing Operator invitation, legal acceptance, offer, Checkout, and webhook path does not require a Site, a root Location, Site branding on `ClinicProfile`, or `createOperatorClinic`.

1. Operator opens `/operator/clinics/{destinationClinicId}/team/invite`.
2. `inviteClinicUserAction` calls `inviteClinicUser`. With no primary Site, the invitation name falls back to the shell Account name. A new user, or an existing user with no active membership, can be invited as `ADMIN`. An active source member is rejected. Email delivery is not a readiness prerequisite.
3. The person opens `/accept-invitation` and `acceptInvitationWithToken` creates the destination `ClinicMembership`.
4. That admin submits `/account/billing/setup`. `saveBillingSetup` writes `ClinicBillingProfile` and a `LegalAcceptance` for the destination Account only. The Operator does not accept legal terms.
5. Operator prepares the offer with `prepareClinicBillingAction` → `prepareClinicCommercialOffer` (Essential or Practice). Zero active Sites satisfies the allowance check.
6. The destination admin starts Checkout from `/account/billing` via `createClinicCheckout`.
7. `POST /api/stripe/webhook` runs `processVerifiedStripeEvent`. `invoice.paid` projects local entitlement `ACTIVE`.
8. The split page recalculates readiness from that local row. A browser return does not mark billing ready.

A destination administrator is either a source member selected to leave the source as `ADMIN`, or an active destination `ADMIN` who is not an active source member. A pending invitation alone is not enough.

Essential is 1 Site and 1 Location. Practice is 1 Site and the configured location allowance. Group is not a destination plan.

## Account structure lock

Ordinary account mutations and the future split execution share one PostgreSQL transaction advisory lock:

`clinic-account-structure:{clinicId}`

`lockClinicAccountStructure(tx, clinicId)` derives that key. Callers pass a transaction client and a clinic id. They do not pass a lock name. `lockClinicAccountStructures(tx, clinicIds)` deduplicates ids, sorts them, and acquires each structure lock in that order. PostgreSQL transaction advisory locks are re-entrant, so a nested helper may request the same lock again inside the transaction that already holds it. There is no application mutex.

The lock is acquired inside the same transaction as the write, before the first structural write and before any narrower advisory lock. It is released at commit or rollback. It is not held across Stripe API calls, Checkout, webhook delivery, email, R2 upload or download, operator review, or browser input.

An open preparation does not freeze the Account. Staff and Operators keep editing. The next dry run may revoke `READY_TO_EXECUTE`. That is intentional. The structure lock only stops those writes from running inside the future execution transaction.

### Mutations that take the lock

- Site create, branding, deactivate, and reactivate, including the primary Site and root Location created with a new Operator Account
- Location create, contact/address update, deactivate, and reactivate
- Practice settings dual-write of the primary Site, root Location, and `ClinicProfile`
- Branding asset reference writes after the R2 upload has finished, and reference clears before the R2 delete
- Guide create, draft save, legacy revision snapshot, publish (including the published revision), unpublish, discard, delete, template adapt, downgrade retention, and retained-guide restore
- Placement enable, disable, latest-revision pin, and location-specific copy
- Invitation create, resend, cancel, and acceptance; direct membership create; role change; activation; and removal
- Operator site, location, team, and guide allowance writes
- Commercial offer preparation writes to `ClinicEntitlement`
- Local Stripe projection into `ClinicBillingProfile` and `ClinicEntitlement`, including scheduled plan and cancellation fields
- Practice → Essential attempt-id allocation and the local schedule projection that follows a completed Stripe call

Reads, page rendering, dry-run preview, patient GETs, marketing pages, and email delivery do not take it.

Preparation create, site decisions, staff selections, shell creation, cancel, and readiness recalculation keep `clinic-account-split:{clinicId}`. They do not take the structure lock. Saving site decisions may rename the destination shell under that preparation lock. Shell slug allocation still takes `clinic-account-split-shell-slug`.

### Lock order

Every participating mutation uses this order. Skip a lock the mutation does not need. Do not invert the ones it does take.

1. `clinic-account-structure:{clinicId}`. Several accounts: sort clinic ids ascending, then lock.
2. Narrower account locks already used by that mutation: `clinic-team-capacity` before `clinic-guide-capacity` when both are taken; `clinic-guide-capacity` before `clinic-site-location-capacity` when both are taken. `clinic-plan-downgrade` is taken after the structure lock in its own short transaction.
3. User and token locks: `clinic-invite-email`, then `clinic-access`, then `account-token`.

Capacity, slug-collision, and team-capacity locks stay. The structure lock does not replace them.

`createClinicCheckout` still calls Stripe inside its database transaction and does not take the structure lock. That transaction writes Checkout session and customer ids. Plan, billing status, allowances, and scheduled changes are projected later by the webhook, which locks only around the local write.

R2 upload and delete stay outside the branding reference transaction. The upload finishes, then the locked transaction stores the object key. A failed database write deletes the new object after the transaction. Removal clears the key inside the locked transaction, then deletes the object.

### Execution transaction

`executeClinicAccountSplit` is operator-only. Clinic admin, clinic staff, and operator-support sessions cannot call it. The browser sends the preparation id and the typed confirmation. Source, destination, Site, guide, and membership targets are loaded from the preparation.

One PostgreSQL transaction does the cutover:

1. Load the source and destination ids.
2. Acquire both `clinic-account-structure` locks in sorted clinic id order.
3. Acquire `clinic-account-split:{sourceClinicId}`.
4. Reload the preparation and recompute readiness with the same rules as the dry run.
5. Reject a wrong confirmation with no writes.
6. If the preparation was `READY_TO_EXECUTE` and the recomputation is no longer ready, store the earlier status from the preparation state machine and stop. No Site, guide, placement, or membership write is kept.
7. Copy guides, delete moving placements, promote the source primary when required, deactivate selected Sites, move the SPLIT Site, and reinsert placements.
8. Before compatibility slugs are written, acquire `clinic-account-split-shell-slug` only when the two rows must exchange slugs.
9. Mirror both profiles. Before membership writes, when memberships move, acquire `clinic-team-capacity` for both Accounts in sorted clinic id order, then `clinic-access:{userId}` for each moved user in sorted user id order.
10. Validate both Accounts. Set `COMPLETED`, `executedAt`, and `executingOperatorUserId` last.

The structure locks are held for the whole transaction, so concurrent site, guide, placement, membership, and billing-projection writes wait. The narrower locks are taken after the reload and immediately before the writes they cover. They still come after the structure locks, in the narrower-lock order, so execution does not invert that order.

`CANCELLED` is rejected. A second call when the status is already `COMPLETED` returns the stored result and does not copy or move anything again.

Any thrown error rolls the transaction back. The Site stays on the source, original placements remain, destination guide copies and maps are absent, memberships are unchanged, and the preparation is not `COMPLETED`.

There is no Stripe, Resend, R2, `fetch`, or webhook call inside the transaction. Execution does not depend on email.

### Guide copies and placements

Every source guide with any placement, including a disabled placement, on any location of the SPLIT Site is copied once. Unrelated source guides stay put and are not modified. The copy keeps title, public slug, status, enabled flag, publish time, sort order, template pin, adaptation provenance, version numbers, sections, overrides, additions, and historical author and attestation ids. Version 0 and published revisions are copied. `copiedFromPracticeGuideId` stays null. Downgrade retention timestamps are cleared on the copy. Provenance is the guide map and revision map, not a cross-account guide foreign key.

Moving placements are captured, deleted, and reinserted with the same ids after the Site and its locations belong to the destination. The reinserted row uses the destination guide and the mapped published revision, or null when the pin was null. `ClinicSite.slug`, `ClinicLocation.slug`, and `Placement.publicSlug` are not changed, so the public URL stays the same. There is no redirect.

### Primary Site, deactivation, and slugs

`keptClinicSiteId` is the Site that should remain when every sequential split is finished. It is not always the source primary after this execution. If the current primary stays active through `RETAIN_ON_SOURCE`, it remains primary. If the current primary is `SPLIT` or `DEACTIVATE`, the kept Site is promoted in the same transaction. The moved Site becomes the destination primary. `DEACTIVATE` sets `active` false and deletes nothing. `RETAIN_ON_SOURCE` is left unchanged.

Before compatibility slugs are written, the transaction rejects a `Clinic.slug` held by an unrelated Account. Destination `Clinic.slug` becomes the moved Site slug. Source `Clinic.slug` becomes the actual post-execution primary Site slug. When those two rows would exchange values, one is parked on a fresh `xsp` compatibility slug and then both final values are written. `ClinicSite.slug` is not changed.

### Profiles, files, and people

Each `ClinicProfile` is mirrored from that Account's post-execution primary Site and its root location. If the former primary moved, the source profile takes the remaining primary Site's branding references and no longer points at the moved Site's keys. Object bytes are not copied or deleted. Existing Site branding keys stay valid even when they contain the source Account id.

Staff decisions are source only or destination only. Destination-only removes the source membership and creates the destination membership with the selected admin or staff role. Source-only memberships stay. Users without a selection are not moved. Outstanding source invitations stay on the source and no invitation email is sent. Users whose membership changed have their database sessions deleted. The destination must still have an active administrator, including one established during shell billing. No person may finish with an active membership in both Accounts.

The source may remain Group. Execution does not require Practice eligibility, does not change the source plan, and does not create a Stripe schedule.

## Sequential-split Clinic.slug

In a sequence of splits, the preparation's kept Site is not always the source primary Site after this split.

Example: Site A is the eventual kept Site, Site B is `SPLIT`, and Site C is the current primary and `RETAIN_ON_SOURCE`. After B moves, C remains the source primary.

Execution therefore sets:

- destination `Clinic.slug` = the moved `ClinicSite.slug`
- source `Clinic.slug` = the actual post-execution primary `ClinicSite.slug`

The source slug mirrors C in that example, not A, and not `preparation.keptClinicSite.slug`. Source `ClinicProfile` mirrors that same post-execution primary Site.

## Compatibility slug preflight

`Clinic.slug` and `ClinicSite.slug` each have their own unique index. There is no cross-table unique constraint. `createOperatorClinic` and `allocateSplitShellSlug` check both tables. `createClinicSiteWithRootLocation` relies on the `ClinicSite` unique index only, so a Site slug can equal another Account's `Clinic.slug`. The historical backfill copies one Clinic's slug onto its own primary Site, which is the same row's compatibility value, not a guarantee about other Accounts.

Before execution writes either compatibility slug, inside the locked transaction, preflight both targets:

- destination target `S` = moved `ClinicSite.slug`
- source target `P` = actual post-execution primary `ClinicSite.slug`

Reject when another `Clinic` already uses `S` or `P`, except the source and destination rows that this transaction will move off that value. `Clinic.slug` unique indexes are not deferrable. If one row currently holds the other row's target, update the releasing row first. If the two rows would exchange slugs, park one on a fresh `xsp` compatibility slug from the shell allocator, then write `S` and `P`. Do not change `ClinicSite.slug` in that cutover.

## Historical site backfill

`20260925021500_add_multi_location_foundation` runs before `20260925190000_add_account_split_preparation`. On a fresh database the backfill runs before application code can create a zero-Site shell. The split migration does not insert shells.

Do not re-run that backfill SQL against a live database that contains split shells. It inserts a `ClinicSite` for every `Clinic` that has none and copies `Clinic.slug` onto that Site, which would publish the shell compatibility slug as a patient hostname. The test replay in `tests/multi-location-foundation.test.ts` scopes the statements to its own clinic ids. There is no separate operational script. Do not edit the deployed migration.

## Security

Every Server Action calls `requireAccountSplitOperator`. Clinic ADMIN, clinic STAFF, and operator-support-as-clinic are rejected. `executeSplitAction` also requires the acting user to be a platform operator before it opens the transaction. After creation, operations load the source, destination, and Sites from the preparation id. A posted Site or user that is not on that source Account is rejected. The execute form posts the preparation id, the typed phrase, and the source clinic id used only to revalidate the operator page. The source clinic id is not the split target.

## Migration

`20260925190000_add_account_split_preparation` is additive. It does not drop, delete, or backfill. Do not apply it to production from Cursor. Production stays on the reviewed `prod:db:*` gate.
