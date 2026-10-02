# Shared demonstration

River Aftercare has one demonstration account. It is the existing clinic `clinic_demo_rivers`, site slug `demodental`. The public hostname `demo.riveraftercare.com.au` is an alias for that site. `demodental.riveraftercare.com.au` keeps resolving.

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

Do not run this against production until Joaquín explicitly approves the write. The command does not load production credentials by itself. It does not create an account, publish a sample, or rewrite a practice-guide revision.

1. Confirm the existing account `clinic_demo_rivers` / slug `demodental` is the account to keep.
2. Dry-run, pointed at the approved database:

   `pnpm configure:shared-demo`

3. Add any missing service categories:

   `pnpm configure:shared-demo -- --apply --allow-production --confirm-shared-demo`

4. Set the neutral River Aftercare Demo Clinic brand only as a separate approval. This clears a stored phone, street address, and contact email on that demo profile and copies the profile onto the primary site and root location. It does not edit guide snapshots.

   `pnpm configure:shared-demo -- --apply --allow-production --confirm-shared-demo --confirm-branding`

5. Publish each new canonical sample in the operator template workspace, then create and publish its practice guide on this account at the designated public slug. Later revisions move only through Update live demo for that category.

6. Enable a marketing link only after the exact guide URL is verified:

   - Dental: `CARE_GUIDE_SHARED_DEMO_DENTAL_URL=https://demo.riveraftercare.com.au/extraction`
   - Physiotherapy: `CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL=https://demo.riveraftercare.com.au/home-exercise-plan`

   Chiropractic and Cosmetic & Aesthetic stay unlinked until those guides exist.

Wildcard DNS `*.riveraftercare.com.au` already reaches the app. No new Vercel domain is required for `demo`. Unknown subdomains still fail closed.
