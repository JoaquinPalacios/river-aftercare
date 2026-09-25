# Account split preparation

Operator-only preparation for moving one ClinicSite off a Group Account onto a new Account. This release stores the preparation, creates an empty destination shell, and previews the split. It does not execute it.

## Implemented

- Additive preparation records and empty guide/revision map tables
- One open preparation per source Account
- Destination shell Account (`Clinic` + `ClinicProfile` only)
- Persisted kept Site, per-site Split or Deactivate decisions, and staff intent
- Destination Essential or Practice target, monthly or yearly
- Dry-run preview and readiness calculated from current data
- Operator UI at `/operator/clinics/[clinicId]/split`
- Cancellation that leaves the source Account and the destination shell in place

## Not implemented

- Moving a Site or Location (`clinicId` stays put)
- Copying guides, revisions, sections, overrides, or additions
- Changing memberships, invitations, or sessions
- Switching the primary Site or cutting `Clinic.slug` over to the moved Site slug
- Group → Practice Stripe or local plan conversion
- Dual-account login or session Account selection
- Copying R2 objects or changing Site branding URLs
- An Execute control

`READY_TO_EXECUTE` means the current snapshot would pass every prerequisite if an execution engine existed. This release has no execute operation and never sets `COMPLETED`.

## V1 limits

One user cannot be active in both the source and destination Accounts. A preparation is not ready when `keepOnSource` and `grantOnDestination` are both true. Multi-account auth is a separate project.

The destination needs an administrator who will not remain an active source member. There is no operator impersonation path for legal acceptance or Checkout. If the customer cannot name that person, the split stays not ready.

A preparation splits one Site onto a **new** shell Account. It does not split into an existing populated Account, merge Accounts, or enter another customer's Account. A Group with several Sites that should each become Accounts is a sequence of preparations. Only one preparation for a source Account is open at a time. Reaching ready requires the hypothetical source to fit Practice, including one active Site, so every other Site in that preparation is an explicit Deactivate. Do not mark a Site Deactivate if it still needs its own later Account. That sequencing limit stays until execution and the deferred Group billing conversion are designed together.

Practice capacity is one **active** Site. Inactive historical Sites may remain.

Guides left on the source are not deleted. If they would exceed Practice guide limits, or if a guide would lose every placement, readiness says so. The operator fixes that with the existing guide tools.

Public patient URLs are the Site slug, location slug, and guide slug. The preview states **PUBLIC URLS WILL NOT CHANGE** when those values are consistent. Branding objects stay at their current source-Account R2 keys.

The future execution phrase is `split {siteSlug}`. It is stored and shown. Typing it does nothing in this release.

Email stays outside the database transaction and outside readiness. Successful delivery is not a prerequisite.

`targetSourcePlan` is Practice for preview only. Source Stripe subscription, source commercial plan, and Group catalog price are unchanged. Group → Practice billing is a later change, after this structure is proven. The current Stripe catalog has no Group price, and the upgrade/downgrade engines reject Group.

## Destination shell

`createSplitDestinationAccount` creates `Clinic` and `ClinicProfile` only. It does not create `ClinicSite`, `ClinicLocation`, `PracticeGuide`, or `PracticeGuidePlacement`. It does not copy Stripe customers, subscriptions, schedules, checkout ids, billing attempts, entitlement extras, legal acceptance, account tokens, or a source downgrade preparation.

The shell `Clinic.slug` matches `xsp` plus 8 hex characters. Allocation checks both `Clinic.slug` and `ClinicSite.slug`. The slug is not written to `ClinicSite`, so it is not a patient hostname. Execution is expected to replace that compatibility slug with the moved Site slug. The shell may have zero Sites. Its name uses the split Site's display name so the operator can recognise it. That does not mean the Site has moved. Do not re-run the historical multi-location site backfill against a shell. That statement inserts a Site for every Clinic that has none, which would turn the compatibility slug into a patient hostname.

## Status

Allowed projection, always from current data:

`DRAFT` → `DESTINATION_READY` → `AWAITING_PAYMENT` → `BILLING_READY` → `READY_TO_EXECUTE`

`CANCELLED` is available before execution. `COMPLETED` is reserved. A later read can move readiness backward when the source, destination, guides, staff, or billing no longer pass. Counts are not trusted from an old preview.

`BILLING_READY` requires the destination's local projection: entitlement `ACTIVE`, billing `ACTIVE`, the preparation's plan and interval, no scheduled cancellation or scheduled plan change, and location allowance enough for the active locations on the moving Site. The dry run does not call Stripe.

Essential is 1 Site and 1 Location. Practice is 1 Site and the configured location allowance. Group is not a destination plan.

## Concurrency

Preparation creation, shell creation, and readiness transitions take `pg_advisory_xact_lock` on `clinic-account-split:{clinicId}`. Shell slug allocation also takes `clinic-account-split-shell-slug`.

A later execution engine should take `clinic-account-split:{sourceClinicId}` before it changes Site ownership, copies guides, or edits memberships. This release does not take that lock around ordinary clinic edits.

## Security

Every Server Action calls `requireAccountSplitOperator`. Clinic ADMIN, clinic STAFF, and operator-support-as-clinic are rejected. After creation, operations load the source, destination, and Sites from the preparation id. A posted Site or user that is not on that source Account is rejected.

## Migration

`20260925190000_add_account_split_preparation` is additive. It does not drop, delete, or backfill. Do not apply it to production from Cursor. Production stays on the reviewed `prod:db:*` gate.
