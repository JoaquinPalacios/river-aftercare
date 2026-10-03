# Shared demonstration

River Aftercare has one demonstration account. Its public slug is `demodental`. The local seed uses account id `clinic_demo_rivers`. Production uses the existing account that already has that slug; the configuration command reads that id from the database and does not hardcode it. The public hostname `demo.riveraftercare.com.au` is an alias for that site. `demodental.riveraftercare.com.au` keeps resolving.

The shared public name is River Aftercare Demo Clinic for every service category. Stored colours, the uploaded logo, and theme settings stay as they are. The production demo's current primary colour is `#0F766E` and its accent is `#2DD4BF`. The command does not replace those with River Aftercare's corporate blue or isologo.

Each service category has its own canonical sample slug and public guide slug:

| Category             | Sample slug                 | Public guide                 | Created by seed             |
| -------------------- | --------------------------- | ---------------------------- | --------------------------- |
| Dental               | `extraction`                | `/extraction`                | Yes, historical guide       |
| Physiotherapy        | `home-exercise-plan`        | `/home-exercise-plan`        | Local synthetic sample only |
| Chiropractic         | `chiropractic-adjustment`   | `/chiropractic-adjustment`   | No                          |
| Cosmetic & Aesthetic | `superficial-chemical-peel` | `/superficial-chemical-peel` | No                          |

Ordinary clinics cannot adopt samples. Updating one category's sample writes only the guide pinned to that sample at its public slug.

`pnpm provision:physio-demo-clinic` is retired and does not connect to a database.

## Production procedure

Do not run this against production until Joaquín explicitly approves the write. The command does not load production credentials by itself. It does not create an account, a site, or a location. It does not publish a sample or rewrite a practice-guide revision, canonical pin, override, or addition.

The Dental sample on the live demo is canonical revision 3, with no retained overrides or additional sections. No Dental content reconciliation is required.

1. Dry-run, pointed at the approved database:

   `pnpm configure:shared-demo`

   Read the printed account id, site id, and root location id. Confirm they are the live `demodental` account, that the primary site slug is `demodental`, and that there is one active site-root location. Confirm the retained colour, logo, and theme match the live demo. The dry-run writes nothing.

2. Add any missing service categories. This leaves colours, logo, theme, contact details, emergency instructions, and guide content unchanged:

   `pnpm configure:shared-demo -- --apply --allow-production --confirm-shared-demo`

3. Update the public name, clear stored contact details, and set the shared emergency sentence only as a separate approval. This still does not change colours, logo, or theme, and it does not edit guide snapshots:

   `pnpm configure:shared-demo -- --apply --allow-production --confirm-shared-demo --confirm-branding`

4. Publish each new canonical sample in the operator template workspace, then create and publish its practice guide on this account at the designated public slug. Later revisions move only through Update live demo for that category.

5. Enable a marketing link only after the exact guide URL is verified:

   - Dental: `CARE_GUIDE_SHARED_DEMO_DENTAL_URL=https://demo.riveraftercare.com.au/extraction`
   - Physiotherapy: `CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL=https://demo.riveraftercare.com.au/home-exercise-plan`

   Set the physiotherapy variable in the Vercel project before the production build. `/physiotherapy` is statically generated, so a runtime-only value does not enable the hero. When the value matches, the hero secondary control is “View the physiotherapy demo” and opens that guide in a new tab. Any other value keeps the disabled placeholder. Chiropractic and Cosmetic & Aesthetic stay unlinked until those guides exist.

Wildcard DNS `*.riveraftercare.com.au` already reaches the app. No new Vercel domain is required for `demo`. Unknown subdomains still fail closed.

## Local fixture alignment

The repository seed still bootstraps Tooth Extraction canonical revision 1 with the Riverside Dental Demo introduction, the `first-24-hours` override “The first day at Riverside Dental Demo”, and the `weekend-contact` addition. A local database that has only that revision shows the same text.

Leave that seed change for a later change. When it is done, edit only the fresh-bootstrap payload. `riversidePracticeSeedPlan` already keeps a practice snapshot, the canonical pin, and the published placement when any published practice revision version is greater than 1. The canonical section rewrite already waits while a published canonical revision newer than version 1 exists. Do not delete practice revisions, move the pin, or change `/extraction`. Do not run the seed against production. Production Dental content is already canonical revision 3 with no overrides or additions.
