/**
 * Audit-only query baseline. Not part of `pnpm test`.
 *
 * Creates a disposable local database, loads representative multi-location
 * fixtures, counts Prisma queries for patient/staff/operator loaders, and
 * runs EXPLAIN (ANALYZE, BUFFERS) on the lookup shapes those loaders emit.
 *
 * Refuses any non-loopback host. Does not migrate or write production.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

import { PrismaPg } from "@prisma/adapter-pg";
import {
  CommercialPlan,
  GuideRevisionStatus,
  PracticeGuideStatus,
  PrismaClient,
} from "@prisma/client";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";

const ADMIN_URL = "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
const AUDIT_DB = "care_guide_perf_audit";
const AUDIT_URL = `postgresql://postgres:postgres@127.0.0.1:5432/${AUDIT_DB}`;

type QueryEvent = { query: string; duration: number; params: string };

const queries: QueryEvent[] = [];
let prisma: PrismaClient;
let practiceClinicId = "";
let practiceSiteId = "";
let practiceRootLocationId = "";
let practiceExtraLocationSlug = "";
let practiceGuideId = "";
let groupClinicId = "";
let largeClinicId = "";

function assertLocal(url: string) {
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Refusing non-local database host ${host}`);
  }
}

async function recreateAuditDatabase() {
  assertLocal(ADMIN_URL);
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [AUDIT_DB]
  );
  await admin.query(`DROP DATABASE IF EXISTS "${AUDIT_DB}"`);
  await admin.query(`CREATE DATABASE "${AUDIT_DB}"`);
  await admin.end();
}

function migrateAuditDatabase() {
  execFileSync(
    "pnpm",
    ["exec", "prisma", "migrate", "deploy", "--config", "prisma.config.ts"],
    {
      cwd: new URL("../..", import.meta.url),
      env: { ...process.env, DATABASE_URL: AUDIT_URL, DIRECT_URL: "" },
      stdio: "inherit",
    }
  );
}

async function sectionCreates(prefix: string) {
  return Array.from({ length: 6 }, (_, index) => ({
    key: `${prefix}-s${index + 1}`,
    kind: "IMMEDIATE_CARE" as const,
    title: `Section ${index + 1}`,
    body: `Recovery instruction ${index + 1} for ${prefix}. Keep the area clean and follow the practice's written advice.`,
    sortOrder: index + 1,
    provenance: "PRACTICE_CUSTOM" as const,
  }));
}

async function createGuide(input: {
  clinicId: string;
  title: string;
  slug: string;
  sortOrder: number;
  copiedFromId?: string;
}) {
  return prisma.practiceGuide.create({
    data: {
      clinicId: input.clinicId,
      title: input.title,
      publicSlug: input.slug,
      status: PracticeGuideStatus.PUBLISHED,
      isEnabled: true,
      sortOrder: input.sortOrder,
      publishedAt: new Date("2026-09-01T00:00:00.000Z"),
      copiedFromPracticeGuideId: input.copiedFromId,
      contentRevisions: {
        create: [
          {
            version: 0,
            status: GuideRevisionStatus.DRAFT,
            title: `${input.title} draft`,
            introduction: "Working draft introduction.",
            sections: { create: await sectionCreates(`${input.slug}-draft`) },
          },
          {
            version: 1,
            status: GuideRevisionStatus.PUBLISHED,
            title: input.title,
            introduction: "Published introduction for patients.",
            publishedAt: new Date("2026-09-01T00:00:00.000Z"),
            sections: { create: await sectionCreates(`${input.slug}-v1`) },
          },
          {
            version: 2,
            status: GuideRevisionStatus.PUBLISHED,
            title: `${input.title} latest`,
            introduction: "Latest published introduction.",
            publishedAt: new Date("2026-09-10T00:00:00.000Z"),
            sections: { create: await sectionCreates(`${input.slug}-v2`) },
          },
        ],
      },
    },
    include: { contentRevisions: { select: { id: true, version: true } } },
  });
}

async function place(input: {
  clinicId: string;
  locationId: string;
  guideId: string;
  publicSlug: string;
  revisionId: string | null;
  enabled?: boolean;
}) {
  await prisma.practiceGuidePlacement.create({
    data: {
      clinicId: input.clinicId,
      locationId: input.locationId,
      practiceGuideId: input.guideId,
      publicSlug: input.publicSlug,
      isEnabled: input.enabled ?? true,
      publishedPracticeGuideRevisionId: input.revisionId,
    },
  });
}

async function createAccount(input: {
  name: string;
  accountSlug: string;
  plan: CommercialPlan;
  siteAllowance: number;
  locationAllowance: number;
  sites: Array<{
    slug: string;
    name: string;
    primary: boolean;
    locations: Array<{ slug: string | null; name: string; root: boolean }>;
  }>;
}) {
  const clinic = await prisma.clinic.create({
    data: {
      name: input.name,
      slug: input.accountSlug,
      entitlement: {
        create: {
          commercialPlan: input.plan,
          billingStatus: "ACTIVE",
          entitlementStatus: "ACTIVE",
          siteAllowance: input.siteAllowance,
          locationAllowance: input.locationAllowance,
        },
      },
    },
  });
  const locations: Array<{
    id: string;
    slug: string | null;
    siteSlug: string;
    root: boolean;
  }> = [];
  for (const siteInput of input.sites) {
    const site = await prisma.clinicSite.create({
      data: {
        clinicId: clinic.id,
        name: siteInput.name,
        slug: siteInput.slug,
        displayName: siteInput.name,
        active: true,
        isPrimary: siteInput.primary,
        primaryColor: "#0f766e",
        accentColor: "#b45309",
        neutralColor: "#f7f7f5",
        radiusPreset: "SOFT",
        typeface: siteInput.primary ? "INTER" : "LATO",
        instructionTerminology: "AFTERCARE",
        themeMode: "LIGHT",
        allowPatientThemeToggle: false,
        showCareGuideAttribution: true,
      },
    });
    for (const locationInput of siteInput.locations) {
      const location = await prisma.clinicLocation.create({
        data: {
          clinicSiteId: site.id,
          clinicId: clinic.id,
          name: locationInput.name,
          slug: locationInput.slug,
          displayName: locationInput.name,
          phone: "0299990000",
          addressLine1: "1 Audit Street",
          city: "Sydney",
          region: "NSW",
          postalCode: "2000",
          country: "AU",
          contactUrl: "https://example.test/contact",
          emergencyInstructions: "Call the practice or emergency services.",
          isPrimary: locationInput.root,
          servesSiteRoot: locationInput.root,
          active: true,
        },
      });
      locations.push({
        id: location.id,
        slug: locationInput.slug,
        siteSlug: siteInput.slug,
        root: locationInput.root,
      });
    }
  }
  return { clinicId: clinic.id, locations };
}

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}

async function measure<T>(name: string, fn: () => Promise<T>) {
  const start = queries.length;
  const began = performance.now();
  const value = await fn();
  const elapsedMs = Math.round((performance.now() - began) * 10) / 10;
  const slice = queries.slice(start);
  const texts = slice.map((event) => normalizeSql(event.query));
  const counts = new Map<string, number>();
  for (const text of texts) {
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  const duplicates = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([query, count]) => ({ count, query: query.slice(0, 180) }));
  return {
    name,
    elapsedMs,
    queryCount: slice.length,
    totalDbMs: Math.round(
      slice.reduce((sum, event) => sum + event.duration, 0)
    ),
    duplicates,
    statements: texts.map((query) => query.slice(0, 220)),
    value,
  };
}

beforeAll(async () => {
  process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
  process.env.AUTH_SECRET =
    "local-audit-only-secret-not-for-production-32chars";
  assertLocal(AUDIT_URL);
  await recreateAuditDatabase();
  migrateAuditDatabase();
  const adapter = new PrismaPg({ connectionString: AUDIT_URL });
  prisma = new PrismaClient({
    adapter,
    log: [{ emit: "event", level: "query" }],
  });
  prisma.$on("query", (event) => {
    queries.push({
      query: event.query,
      duration: event.duration,
      params: event.params,
    });
  });
  const globalState = globalThis as typeof globalThis & {
    prisma?: PrismaClient;
    prismaAdapter?: PrismaPg;
  };
  globalState.prisma = prisma;
  globalState.prismaAdapter = adapter;
  process.env.DATABASE_URL = AUDIT_URL;

  const practice = await createAccount({
    name: "Performance Practice",
    accountSlug: "perf-practice-account",
    plan: CommercialPlan.PRACTICE,
    siteAllowance: 1,
    locationAllowance: 5,
    sites: [
      {
        slug: "perfdental",
        name: "Performance Dental",
        primary: true,
        locations: [
          { slug: null, name: "Sydney CBD", root: true },
          { slug: "bondi", name: "Bondi", root: false },
          { slug: "parramatta", name: "Parramatta", root: false },
          { slug: "newcastle", name: "Newcastle", root: false },
          { slug: "wollongong", name: "Wollongong", root: false },
        ],
      },
    ],
  });
  practiceClinicId = practice.clinicId;
  const root = practice.locations.find((location) => location.root);
  if (!root) {
    throw new Error("Missing practice root");
  }
  practiceRootLocationId = root.id;
  practiceExtraLocationSlug = "bondi";
  const practiceGuides = [];
  for (let index = 0; index < 8; index += 1) {
    practiceGuides.push(
      await createGuide({
        clinicId: practice.clinicId,
        title: `Practice guide ${index + 1}`,
        slug: `practice-guide-${index + 1}`,
        sortOrder: index + 1,
      })
    );
  }
  practiceGuideId = practiceGuides[0].id;
  const latest = (guide: (typeof practiceGuides)[number]) =>
    guide.contentRevisions.find((revision) => revision.version === 2)?.id ??
    null;
  for (const [index, guide] of practiceGuides.entries()) {
    await place({
      clinicId: practice.clinicId,
      locationId: root.id,
      guideId: guide.id,
      publicSlug: guide.publicSlug,
      revisionId: latest(guide),
    });
    if (index < 4) {
      for (const location of practice.locations.filter((item) => !item.root)) {
        await place({
          clinicId: practice.clinicId,
          locationId: location.id,
          guideId: guide.id,
          publicSlug: guide.publicSlug,
          revisionId: latest(guide),
        });
      }
    }
  }

  const group = await createAccount({
    name: "Performance Group",
    accountSlug: "perf-group-account",
    plan: CommercialPlan.GROUP,
    siteAllowance: 3,
    locationAllowance: 5,
    sites: [
      {
        slug: "perfgroup-north",
        name: "North Site",
        primary: true,
        locations: [
          { slug: null, name: "North root", root: true },
          { slug: "north-annex", name: "North annex", root: false },
        ],
      },
      {
        slug: "perfgroup-south",
        name: "South Site",
        primary: false,
        locations: [
          { slug: null, name: "South root", root: true },
          { slug: "south-annex", name: "South annex", root: false },
        ],
      },
      {
        slug: "perfgroup-west",
        name: "West Site",
        primary: false,
        locations: [{ slug: null, name: "West root", root: true }],
      },
    ],
  });
  groupClinicId = group.clinicId;
  const shared = await createGuide({
    clinicId: group.clinicId,
    title: "Shared group guide",
    slug: "shared-guide",
    sortOrder: 1,
  });
  const detachedSource = await createGuide({
    clinicId: group.clinicId,
    title: "Source guide",
    slug: "source-guide",
    sortOrder: 2,
  });
  await createGuide({
    clinicId: group.clinicId,
    title: "Detached copy",
    slug: "detached-copy",
    sortOrder: 3,
    copiedFromId: detachedSource.id,
  });
  for (let index = 0; index < 5; index += 1) {
    await createGuide({
      clinicId: group.clinicId,
      title: `Group guide ${index + 1}`,
      slug: `group-guide-${index + 1}`,
      sortOrder: index + 4,
    });
  }
  const groupGuides = await prisma.practiceGuide.findMany({
    where: { clinicId: group.clinicId },
    include: { contentRevisions: { select: { id: true, version: true } } },
  });
  for (const location of group.locations) {
    for (const guide of groupGuides.slice(0, 4)) {
      const revisionId =
        guide.contentRevisions.find((revision) => revision.version === 2)?.id ??
        null;
      await place({
        clinicId: group.clinicId,
        locationId: location.id,
        guideId: guide.id,
        publicSlug: guide.publicSlug,
        revisionId,
      });
    }
  }
  // One guide stays unplaced. Shared guide is the first created.
  expect(shared.id).toBeTruthy();

  const large = await createAccount({
    name: "Performance Larger Practice",
    accountSlug: "perf-large-account",
    plan: CommercialPlan.GROUP,
    siteAllowance: 2,
    locationAllowance: 8,
    sites: [
      {
        slug: "perflarge",
        name: "Larger Practice",
        primary: true,
        locations: [
          { slug: null, name: "Large root", root: true },
          ...Array.from({ length: 7 }, (_, index) => ({
            slug: `place-${index + 1}`,
            name: `Place ${index + 1}`,
            root: false,
          })),
        ],
      },
    ],
  });
  largeClinicId = large.clinicId;
  const largeGuides = [];
  for (let index = 0; index < 12; index += 1) {
    largeGuides.push(
      await createGuide({
        clinicId: large.clinicId,
        title: `Large guide ${index + 1}`,
        slug: `large-guide-${index + 1}`,
        sortOrder: index + 1,
      })
    );
  }
  const largeRoot = large.locations.find((location) => location.root);
  if (!largeRoot) {
    throw new Error("Missing large root");
  }
  for (const guide of largeGuides) {
    const revisionId =
      guide.contentRevisions.find((revision) => revision.version === 2)?.id ??
      null;
    const targets = [
      largeRoot,
      ...large.locations.filter((item) => !item.root).slice(0, 3),
    ];
    for (const location of targets) {
      await place({
        clinicId: large.clinicId,
        locationId: location.id,
        guideId: guide.id,
        publicSlug: guide.publicSlug,
        revisionId,
      });
    }
  }

  await prisma.$executeRawUnsafe("ANALYZE");
  queries.length = 0;
});

afterAll(async () => {
  await prisma?.$disconnect();
});

it("counts loader queries and explains hot lookups", async () => {
  const { getClinicBySlug } =
    await import("@/lib/aftercare/get-clinic-by-slug");
  const { getPublishedPracticeGuide } =
    await import("@/lib/aftercare/get-published-practice-guide");
  const { listPublishedPracticeGuides } =
    await import("@/lib/aftercare/list-published-practice-guides");
  const { listPublishedLocationGuides } =
    await import("@/lib/aftercare/list-published-location-guides");
  const { listAccountSites, getAccountSite } =
    await import("@/lib/clinics/list-account-sites");
  const { loadGuidePlacementBoard } =
    await import("@/lib/clinic-portal/guide-placements");
  const { loadPracticeGuideEditor } =
    await import("@/lib/clinic-portal/load-practice-guide-editor");
  const { listOperatorClinics } =
    await import("@/lib/operator/list-operator-clinics");
  const { getOperatorClinic } =
    await import("@/lib/operator/get-operator-clinic");
  const { loadOperatorSiteLocationCapacity } =
    await import("@/lib/operator/update-site-location-allowance");

  const results = [];
  results.push(
    await measure("practice-root-home-loader", () =>
      listPublishedPracticeGuides("perfdental")
    )
  );
  results.push(
    await measure("practice-root-guide-loader", () =>
      getPublishedPracticeGuide({
        clinicSlug: "perfdental",
        publicSlug: "practice-guide-1",
      })
    )
  );
  results.push(
    await measure("practice-location-home-loader", () =>
      listPublishedLocationGuides({
        siteSlug: "perfdental",
        locationSlug: practiceExtraLocationSlug,
      })
    )
  );
  results.push(
    await measure("practice-location-guide-loader", () =>
      getPublishedPracticeGuide({
        clinicSlug: "perfdental",
        locationSlug: practiceExtraLocationSlug,
        publicSlug: "practice-guide-1",
      })
    )
  );
  results.push(
    await measure("practice-root-print-same-loader", () =>
      getPublishedPracticeGuide({
        clinicSlug: "perfdental",
        publicSlug: "practice-guide-1",
      })
    )
  );
  results.push(
    await measure("large-root-home-loader", () =>
      listPublishedPracticeGuides("perflarge")
    )
  );
  results.push(
    await measure("group-root-home-loader", () =>
      listPublishedPracticeGuides("perfgroup-north")
    )
  );
  results.push(
    await measure("group-location-guide-loader", () =>
      getPublishedPracticeGuide({
        clinicSlug: "perfgroup-north",
        locationSlug: "north-annex",
        publicSlug: "shared-guide",
      })
    )
  );
  results.push(
    await measure("staff-sites-list", () => listAccountSites(groupClinicId))
  );
  const groupSites = await listAccountSites(groupClinicId);
  queries.length = queries.length;
  results.push(
    await measure("staff-site-detail-via-full-list", () =>
      getAccountSite(groupClinicId, groupSites.sites[0]?.id ?? "")
    )
  );
  results.push(
    await measure("staff-sites-list-large", () =>
      listAccountSites(largeClinicId)
    )
  );
  results.push(
    await measure("guide-editor", () =>
      loadPracticeGuideEditor({
        clinicId: practiceClinicId,
        guideId: practiceGuideId,
      })
    )
  );
  const sharedGuide = await prisma.practiceGuide.findFirstOrThrow({
    where: { clinicId: groupClinicId, publicSlug: "shared-guide" },
    select: { id: true },
  });
  const largeGuide = await prisma.practiceGuide.findFirstOrThrow({
    where: { clinicId: largeClinicId },
    select: { id: true },
  });
  queries.length = 0;
  results.push(
    await measure("placement-board", () =>
      loadGuidePlacementBoard({
        clinicId: groupClinicId,
        guideId: sharedGuide.id,
        requestHost: "app.localhost:3000",
        protocol: "http",
      })
    )
  );
  results.push(
    await measure("placement-board-large", () =>
      loadGuidePlacementBoard({
        clinicId: largeClinicId,
        guideId: largeGuide.id,
        requestHost: "app.localhost:3000",
        protocol: "http",
      })
    )
  );
  results.push(await measure("operator-list", () => listOperatorClinics()));
  results.push(
    await measure("operator-detail", () => getOperatorClinic(groupClinicId))
  );
  results.push(
    await measure("operator-capacity", () =>
      loadOperatorSiteLocationCapacity(groupClinicId)
    )
  );
  results.push(
    await measure("tenant-slug-only", () => getClinicBySlug("perfdental"))
  );

  const site = await prisma.clinicSite.findUniqueOrThrow({
    where: { slug: "perfdental" },
    select: { id: true },
  });
  practiceSiteId = site.id;

  const plans: Array<{ name: string; plan: string }> = [];
  async function explain(name: string, sql: string, params: unknown[]) {
    const rows = await prisma.$queryRawUnsafe<Array<{ "QUERY PLAN": string }>>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`,
      ...params
    );
    plans.push({
      name,
      plan: rows.map((row) => row["QUERY PLAN"]).join("\n"),
    });
  }

  await explain(
    "clinic-site-by-slug",
    `SELECT id FROM "ClinicSite" WHERE slug = $1`,
    ["perfdental"]
  );
  await explain(
    "location-by-site-and-slug",
    `SELECT id FROM "ClinicLocation" WHERE "clinicSiteId" = $1 AND slug = $2 AND active = true AND "servesSiteRoot" = false`,
    [practiceSiteId, "bondi"]
  );
  await explain(
    "root-location-by-site",
    `SELECT id FROM "ClinicLocation" WHERE "clinicSiteId" = $1 AND "servesSiteRoot" = true AND active = true`,
    [practiceSiteId]
  );
  await explain(
    "placement-by-location-and-slug",
    `SELECT id FROM "PracticeGuidePlacement" WHERE "locationId" = $1 AND "publicSlug" = $2 AND "isEnabled" = true`,
    [practiceRootLocationId, "practice-guide-1"]
  );
  await explain(
    "placement-by-clinic-and-slug",
    `SELECT id FROM "PracticeGuidePlacement" WHERE "clinicId" = $1 AND "publicSlug" = $2 AND "isEnabled" = true`,
    [practiceClinicId, "practice-guide-1"]
  );
  await explain(
    "active-site-count",
    `SELECT count(*) FROM "ClinicSite" WHERE "clinicId" = $1 AND active = true`,
    [groupClinicId]
  );
  await explain(
    "active-location-count",
    `SELECT count(*) FROM "ClinicLocation" l JOIN "ClinicSite" s ON s.id = l."clinicSiteId" WHERE l."clinicId" = $1 AND l.active = true AND s.active = true`,
    [largeClinicId]
  );
  await explain(
    "operator-clinics-order-by-name",
    `SELECT id FROM "Clinic" ORDER BY name ASC`,
    []
  );

  const summary = results.map((result) => ({
    name: result.name,
    elapsedMs: result.elapsedMs,
    queryCount: result.queryCount,
    totalDbMs: result.totalDbMs,
    duplicateCount: result.duplicates.length,
    duplicates: result.duplicates,
    statements: result.statements,
    payload:
      result.name === "practice-root-home-loader"
        ? {
            guides: (result.value as { guides?: unknown[] } | null)?.guides
              ?.length,
          }
        : result.name === "placement-board"
          ? {
              sites: (result.value as { sites?: unknown[] } | null)?.sites
                ?.length,
              jsonBytes: Buffer.byteLength(JSON.stringify(result.value)),
            }
          : result.name === "placement-board-large"
            ? {
                locations: (
                  result.value as {
                    sites?: Array<{ locations: unknown[] }>;
                  } | null
                )?.sites?.[0]?.locations.length,
                jsonBytes: Buffer.byteLength(JSON.stringify(result.value)),
              }
            : result.name === "guide-editor"
              ? { jsonBytes: Buffer.byteLength(JSON.stringify(result.value)) }
              : result.name === "staff-sites-list"
                ? {
                    sites: (result.value as { sites?: unknown[] }).sites
                      ?.length,
                    jsonBytes: Buffer.byteLength(JSON.stringify(result.value)),
                  }
                : result.name === "operator-list"
                  ? {
                      clinics: (result.value as unknown[]).length,
                      jsonBytes: Buffer.byteLength(
                        JSON.stringify(result.value)
                      ),
                    }
                  : undefined,
  }));

  const counts = await prisma.$queryRawUnsafe<
    Array<{ label: string; count: number }>
  >(`
    SELECT 'practice_locations' AS label, count(*)::int AS count FROM "ClinicLocation" WHERE "clinicId" = '${practiceClinicId}'
    UNION ALL SELECT 'practice_guides', count(*)::int FROM "PracticeGuide" WHERE "clinicId" = '${practiceClinicId}'
    UNION ALL SELECT 'practice_placements', count(*)::int FROM "PracticeGuidePlacement" WHERE "clinicId" = '${practiceClinicId}'
    UNION ALL SELECT 'group_sites', count(*)::int FROM "ClinicSite" WHERE "clinicId" = '${groupClinicId}'
    UNION ALL SELECT 'group_locations', count(*)::int FROM "ClinicLocation" WHERE "clinicId" = '${groupClinicId}'
    UNION ALL SELECT 'group_guides', count(*)::int FROM "PracticeGuide" WHERE "clinicId" = '${groupClinicId}'
    UNION ALL SELECT 'group_placements', count(*)::int FROM "PracticeGuidePlacement" WHERE "clinicId" = '${groupClinicId}'
    UNION ALL SELECT 'large_locations', count(*)::int FROM "ClinicLocation" WHERE "clinicId" = '${largeClinicId}'
    UNION ALL SELECT 'large_guides', count(*)::int FROM "PracticeGuide" WHERE "clinicId" = '${largeClinicId}'
    UNION ALL SELECT 'large_placements', count(*)::int FROM "PracticeGuidePlacement" WHERE "clinicId" = '${largeClinicId}'
  `);

  const output = { counts, summary, plans };
  writeFileSync(
    "/tmp/perf-audit/query-baseline.json",
    JSON.stringify(output, null, 2)
  );
  console.log(JSON.stringify(summary, null, 2));
  console.log("--- plans ---");
  for (const plan of plans) {
    console.log(`\n## ${plan.name}\n${plan.plan}`);
  }
  expect(
    summary.find((item) => item.name === "practice-root-home-loader")
      ?.queryCount
  ).toBeGreaterThan(0);
});
