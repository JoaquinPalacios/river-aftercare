# Shared demonstration

River Aftercare has one demonstration account. Its site slug is `demodental`. The local seed uses account id `clinic_demo_rivers`. Production uses the existing account that already has that slug; the configuration command reads that id from the database and does not hardcode it. Generated public URLs use the preferred hostname `demo.riveraftercare.com.au`. `demodental.riveraftercare.com.au` keeps resolving the same site, with no redirect. Canonical metadata for both hostnames uses the preferred host. In-page patient links stay relative, so a visit that starts on either hostname continues on that hostname.

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

5. Enable marketing links only after each guide URL is verified. `/dental`, `/physiotherapy`, and `/chiropractic` are statically generated (`dynamic = "error"`), so Vercel must supply the variables at build time. A runtime-only value does not change the hero.

   Preferred variables:

   - Dental: `RIVER_AFTERCARE_DEMO_DENTAL_URL=https://demo.riveraftercare.com.au/extraction`
   - Physiotherapy: `RIVER_AFTERCARE_DEMO_PHYSIOTHERAPY_URL=https://demo.riveraftercare.com.au/home-exercise-plan`
   - Chiropractic: `RIVER_AFTERCARE_DEMO_CHIROPRACTIC_URL=https://demo.riveraftercare.com.au/chiropractic-adjustment`

   Leave `RIVER_AFTERCARE_DEMO_COSMETIC_AESTHETIC_URL` unset. That name is reserved for `https://demo.riveraftercare.com.au/superficial-chemical-peel` and does not enable a marketing CTA until that sample is published.

   Each value must be HTTPS on `demo.riveraftercare.com.au` with that category's exact guide path. A trailing slash is accepted and the CTA uses the canonical URL without it. Any other host, path, query, or hash leaves Physiotherapy and Chiropractic unavailable. Dental marketing still opens the shared Tooth Extraction guide rather than publishing an unrecognised URL.

   Deprecated names still work when the matching new variable is unset or blank. The new variable wins when both are set, including when the new value fails validation. The legacy Dental value `https://demodental.riveraftercare.com.au/extraction` (or that host with no extra path) is recognised and resolved to `https://demo.riveraftercare.com.au/extraction`. Other hosts are not rewritten. `demodental.riveraftercare.com.au` keeps serving existing patient links.

   - `CARE_GUIDE_SHARED_DEMO_DENTAL_URL`
   - `CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL`

   Retire the old variables after this release is deployed with the three new variables set: delete the two `CARE_GUIDE_*` demo URL entries from Vercel. Do not remove them before the new variables are present on the build that is going live. A later change can delete the legacy reads once no environment still relies on them. Do not rename `CARE_GUIDE_ROOT_DOMAIN` as part of this configuration.

Wildcard DNS `*.riveraftercare.com.au` already reaches the app. No new Vercel domain is required for `demo`. Unknown subdomains still fail closed.

## Local fixture alignment

The repository seed still bootstraps Tooth Extraction canonical revision 1 with the Riverside Dental Demo introduction, the `first-24-hours` override “The first day at Riverside Dental Demo”, and the `weekend-contact` addition. A local database that has only that revision shows the same text.

Leave that seed change for a later change. When it is done, edit only the fresh-bootstrap payload. `riversidePracticeSeedPlan` already keeps a practice snapshot, the canonical pin, and the published placement when any published practice revision version is greater than 1. The canonical section rewrite already waits while a published canonical revision newer than version 1 exists. Do not delete practice revisions, move the pin, or change `/extraction`. Do not run the seed against production. Production Dental content is already canonical revision 3 with no overrides or additions.
