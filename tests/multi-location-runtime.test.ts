import "dotenv/config";

import {
  GuideRevisionStatus,
  PracticeGuideStatus,
  type PrismaClient,
} from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getClinicBySlug } from "@/lib/aftercare/get-clinic-by-slug";
import { getPublishedPracticeGuide } from "@/lib/aftercare/get-published-practice-guide";
import { listPublishedPracticeGuides } from "@/lib/aftercare/list-published-practice-guides";
import { adaptPracticeGuideFromTemplate } from "@/lib/clinic-portal/adapt-practice-guide";
import {
  createCustomPracticeGuide,
  createPracticeGuideFromTemplate,
} from "@/lib/clinic-portal/create-practice-guide";
import { deletePracticeGuide } from "@/lib/clinic-portal/delete-practice-guide-draft";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { loadPublishedGuideShareTarget } from "@/lib/clinic-portal/published-guide-share";
import { publishPracticeGuide } from "@/lib/clinic-portal/publish-practice-guide";
import { savePracticeGuideDraft } from "@/lib/clinic-portal/save-practice-guide-draft";
import {
  syncBrandingAssetReference,
  syncPracticeSettings,
} from "@/lib/clinic-portal/sync-practice-chrome";
import { unpublishPracticeGuide } from "@/lib/clinic-portal/unpublish-practice-guide";
import { updatePracticeSettings } from "@/lib/clinic-portal/update-practice-settings";
import type { PracticeSettingsInput } from "@/lib/clinic-portal/practice-settings-schema";
import { getPrisma } from "@/lib/prisma";

const PREFIX = "mlrt_";
const ACCOUNT_SLUG = "mlrt-old-internal";
const SITE_SLUG = "mlrt-public-site";
const OTHER_SLUG = "mlrt-other-site";

const settings = {
  displayName: "Legacy Profile Brand",
  logoUrl: "/demo/legacy-logo.svg",
  darkLogoUrl: null,
  faviconUrl: null,
  primaryColor: "#111111",
  accentColor: "#222222",
  darkPrimaryColor: null,
  darkAccentColor: null,
  useCustomDarkBranding: false,
  neutralColor: "#333333",
  radiusPreset: "SHARP",
  typeface: null,
  instructionTerminology: "AFTERCARE",
  themeMode: "DARK",
  allowPatientThemeToggle: false,
  phone: "0211111111",
  contactUrl: "https://legacy.example.test/contact",
  addressLine1: "1 Legacy Street",
  addressLine2: null,
  city: "Legacyville",
  region: "NSW",
  postalCode: "2000",
  emergencyInstructions: "Legacy emergency copy.",
} satisfies PracticeSettingsInput;

function db(): PrismaClient {
  return getPrisma();
}

async function cleanup(): Promise<void> {
  const prisma = db();
  await prisma.clinic.deleteMany({
    where: { id: { startsWith: PREFIX } },
  });
  await prisma.guideTemplate.deleteMany({
    where: { id: { startsWith: PREFIX } },
  });
  await prisma.user.deleteMany({
    where: { id: { startsWith: PREFIX } },
  });
}

async function seedAccount(input: {
  id: string;
  name: string;
  accountSlug: string;
  siteSlug: string;
  userId: string;
}): Promise<{ siteId: string; locationId: string }> {
  const prisma = db();
  await prisma.user.create({
    data: {
      id: input.userId,
      email: `${input.userId}@example.test`,
      name: input.name,
    },
  });
  await prisma.clinic.create({
    data: {
      id: input.id,
      name: input.name,
      slug: input.accountSlug,
      profile: { create: settings },
      memberships: {
        create: { userId: input.userId, role: "ADMIN" },
      },
    },
  });
  const site = await prisma.clinicSite.create({
    data: {
      id: `${PREFIX}site_${input.id}`,
      clinicId: input.id,
      name: input.name,
      slug: input.siteSlug,
      displayName: "Authoritative Site Brand",
      active: true,
      isPrimary: true,
      logoUrl: "/demo/site-logo.svg",
      primaryColor: "#0f766e",
      accentColor: "#b45309",
      neutralColor: "#f7f7f5",
      radiusPreset: "SOFT",
      instructionTerminology: "RECOVERY",
      themeMode: "LIGHT",
      allowPatientThemeToggle: true,
      showCareGuideAttribution: true,
    },
  });
  const location = await prisma.clinicLocation.create({
    data: {
      id: `${PREFIX}loc_${input.id}`,
      clinicSiteId: site.id,
      clinicId: input.id,
      name: "Root place",
      slug: null,
      displayName: "Location Name Must Not Replace Brand",
      phone: "0299990000",
      addressLine1: "9 Root Road",
      city: "Robina",
      region: "QLD",
      postalCode: "4226",
      country: "AU",
      contactUrl: "https://site.example.test/contact",
      contactEmail: "site@example.test",
      bookingUrl: "https://site.example.test/book",
      emergencyInstructions: "Site emergency copy.",
      isPrimary: true,
      servesSiteRoot: true,
      active: true,
    },
  });
  return { siteId: site.id, locationId: location.id };
}

async function seedTemplate(): Promise<{
  templateId: string;
  revisionId: string;
}> {
  const templateId = `${PREFIX}template`;
  const revisionId = `${PREFIX}template_rev`;
  await db().guideTemplate.create({
    data: {
      id: templateId,
      specialty: "DENTAL",
      slug: "mlrt-template",
      title: "Template Guide",
      revisions: {
        create: {
          id: revisionId,
          version: 1,
          status: GuideRevisionStatus.PUBLISHED,
          publishedAt: new Date("2026-09-01T00:00:00.000Z"),
          reviewedAt: new Date("2026-09-01T00:00:00.000Z"),
          reviewedBy: "Runtime reviewer",
          sections: {
            create: {
              key: "introduction",
              kind: "INTRODUCTION",
              title: "Template introduction",
              body: "Canonical template body.",
              sortOrder: 1,
            },
          },
        },
      },
    },
  });
  return { templateId, revisionId };
}

describe("multi-location runtime switch", () => {
  const previousRoot = process.env.CARE_GUIDE_ROOT_DOMAIN;

  beforeAll(() => {
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
  });

  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    if (previousRoot === undefined) {
      delete process.env.CARE_GUIDE_ROOT_DOMAIN;
    } else {
      process.env.CARE_GUIDE_ROOT_DOMAIN = previousRoot;
    }
    await db().$disconnect();
  });

  it("resolves the site hostname and ignores a different account slug", async () => {
    await seedAccount({
      id: `${PREFIX}clinic`,
      name: "Runtime Clinic",
      accountSlug: ACCOUNT_SLUG,
      siteSlug: SITE_SLUG,
      userId: `${PREFIX}user`,
    });

    const tenant = await getClinicBySlug(SITE_SLUG);
    expect(tenant?.slug).toBe(SITE_SLUG);
    expect(tenant?.profile?.displayName).toBe("Authoritative Site Brand");
    expect(tenant?.profile?.primaryColor).toBe("#0f766e");
    expect(tenant?.profile?.phone).toBe("0299990000");
    expect(tenant?.profile?.addressLine1).toBe("9 Root Road");
    expect(tenant?.profile?.emergencyInstructions).toBe("Site emergency copy.");
    expect(tenant?.profile?.displayName).not.toBe(
      "Location Name Must Not Replace Brand"
    );
    await expect(getClinicBySlug(ACCOUNT_SLUG)).resolves.toBeNull();
  });

  it("fails closed for an inactive site and a missing root location", async () => {
    const seeded = await seedAccount({
      id: `${PREFIX}clinic`,
      name: "Runtime Clinic",
      accountSlug: ACCOUNT_SLUG,
      siteSlug: SITE_SLUG,
      userId: `${PREFIX}user`,
    });
    await db().clinicSite.update({
      where: { id: seeded.siteId },
      data: { active: false },
    });
    await expect(getClinicBySlug(SITE_SLUG)).resolves.toBeNull();

    await db().clinicSite.update({
      where: { id: seeded.siteId },
      data: { active: true },
    });
    await db().clinicLocation.update({
      where: { id: seeded.locationId },
      data: { active: false },
    });
    await expect(getClinicBySlug(SITE_SLUG)).resolves.toBeNull();
  });

  it("serves an enabled root placement and hides a published guide whose placement is disabled", async () => {
    const seeded = await seedAccount({
      id: `${PREFIX}clinic`,
      name: "Runtime Clinic",
      accountSlug: ACCOUNT_SLUG,
      siteSlug: SITE_SLUG,
      userId: `${PREFIX}user`,
    });
    const revision = await db().practiceGuide.create({
      data: {
        clinicId: `${PREFIX}clinic`,
        title: "Guide title",
        publicSlug: "guide-row-slug",
        status: PracticeGuideStatus.PUBLISHED,
        isEnabled: true,
        publishedAt: new Date("2026-09-01T00:00:00.000Z"),
        contentRevisions: {
          create: [
            {
              version: 1,
              status: GuideRevisionStatus.PUBLISHED,
              title: "Older pinned title",
              publishedAt: new Date("2026-09-01T00:00:00.000Z"),
              sections: {
                create: {
                  key: "care",
                  kind: "IMMEDIATE_CARE",
                  title: "Older care",
                  body: "Older body.",
                  sortOrder: 1,
                  provenance: "PRACTICE_CUSTOM",
                },
              },
            },
            {
              version: 2,
              status: GuideRevisionStatus.PUBLISHED,
              title: "Newer unused title",
              publishedAt: new Date("2026-09-02T00:00:00.000Z"),
              sections: {
                create: {
                  key: "care",
                  kind: "IMMEDIATE_CARE",
                  title: "Newer care",
                  body: "Newer body.",
                  sortOrder: 1,
                  provenance: "PRACTICE_CUSTOM",
                },
              },
            },
          ],
        },
      },
      include: { contentRevisions: true },
    });
    const older = revision.contentRevisions.find((row) => row.version === 1);
    if (!older) {
      throw new Error("Missing older revision.");
    }
    await db().practiceGuidePlacement.create({
      data: {
        clinicId: `${PREFIX}clinic`,
        locationId: seeded.locationId,
        practiceGuideId: revision.id,
        publicSlug: "patient-slug",
        isEnabled: true,
        publishedPracticeGuideRevisionId: older.id,
      },
    });

    const published = await getPublishedPracticeGuide({
      clinicSlug: SITE_SLUG,
      publicSlug: "patient-slug",
    });
    expect(published?.title).toBe("Older pinned title");
    expect(published?.sections[0]?.body).toBe("Older body.");
    expect(published?.practiceGuide.publicSlug).toBe("patient-slug");
    expect(published?.profile?.displayName).toBe("Authoritative Site Brand");
    expect(published?.profile?.phone).toBe("0299990000");
    await expect(
      getPublishedPracticeGuide({
        clinicSlug: SITE_SLUG,
        publicSlug: "guide-row-slug",
      })
    ).resolves.toBeNull();

    await db().practiceGuidePlacement.update({
      where: {
        locationId_practiceGuideId: {
          locationId: seeded.locationId,
          practiceGuideId: revision.id,
        },
      },
      data: { isEnabled: false },
    });
    await expect(
      getPublishedPracticeGuide({
        clinicSlug: SITE_SLUG,
        publicSlug: "patient-slug",
      })
    ).resolves.toBeNull();
    const listed = await listPublishedPracticeGuides(SITE_SLUG);
    expect(listed?.guides).toEqual([]);
  });

  it("renders a canonical template when the placement clinic revision is null", async () => {
    const seeded = await seedAccount({
      id: `${PREFIX}clinic`,
      name: "Runtime Clinic",
      accountSlug: ACCOUNT_SLUG,
      siteSlug: SITE_SLUG,
      userId: `${PREFIX}user`,
    });
    const template = await seedTemplate();
    const guide = await db().practiceGuide.create({
      data: {
        clinicId: `${PREFIX}clinic`,
        title: "Supplied template",
        guideTemplateId: template.templateId,
        pinnedRevisionId: template.revisionId,
        publicSlug: "supplied",
        status: PracticeGuideStatus.PUBLISHED,
        isEnabled: true,
        publishedAt: new Date("2026-09-01T00:00:00.000Z"),
      },
    });
    await db().practiceGuidePlacement.create({
      data: {
        clinicId: `${PREFIX}clinic`,
        locationId: seeded.locationId,
        practiceGuideId: guide.id,
        publicSlug: "supplied",
        isEnabled: true,
        publishedPracticeGuideRevisionId: null,
      },
    });

    const document = await getPublishedPracticeGuide({
      clinicSlug: SITE_SLUG,
      publicSlug: "supplied",
    });
    expect(document?.sections[0]?.body).toBe("Canonical template body.");
    expect(document?.revision.id).toBe(template.revisionId);
  });

  it("lists only enabled placements at the site root", async () => {
    const seeded = await seedAccount({
      id: `${PREFIX}clinic`,
      name: "Runtime Clinic",
      accountSlug: ACCOUNT_SLUG,
      siteSlug: SITE_SLUG,
      userId: `${PREFIX}user`,
    });
    await seedAccount({
      id: `${PREFIX}other`,
      name: "Other Clinic",
      accountSlug: "mlrt-other-account",
      siteSlug: OTHER_SLUG,
      userId: `${PREFIX}other_user`,
    });
    const visible = await db().practiceGuide.create({
      data: {
        clinicId: `${PREFIX}clinic`,
        title: "Visible",
        publicSlug: "visible",
        status: PracticeGuideStatus.PUBLISHED,
        isEnabled: true,
        sortOrder: 2,
        publishedAt: new Date("2026-09-01T00:00:00.000Z"),
        contentRevisions: {
          create: {
            version: 1,
            status: GuideRevisionStatus.PUBLISHED,
            title: "Visible",
            publishedAt: new Date("2026-09-01T00:00:00.000Z"),
            sections: {
              create: {
                key: "care",
                kind: "IMMEDIATE_CARE",
                title: "Care",
                body: "Visible body.",
                sortOrder: 1,
                provenance: "PRACTICE_CUSTOM",
              },
            },
          },
        },
      },
    });
    const hidden = await db().practiceGuide.create({
      data: {
        clinicId: `${PREFIX}clinic`,
        title: "Hidden published",
        publicSlug: "hidden",
        status: PracticeGuideStatus.PUBLISHED,
        isEnabled: true,
        sortOrder: 1,
        publishedAt: new Date("2026-09-01T00:00:00.000Z"),
        contentRevisions: {
          create: {
            version: 1,
            status: GuideRevisionStatus.PUBLISHED,
            title: "Hidden published",
            publishedAt: new Date("2026-09-01T00:00:00.000Z"),
            sections: {
              create: {
                key: "care",
                kind: "IMMEDIATE_CARE",
                title: "Care",
                body: "Hidden body.",
                sortOrder: 1,
                provenance: "PRACTICE_CUSTOM",
              },
            },
          },
        },
      },
    });
    const otherLocation = await db().clinicLocation.create({
      data: {
        clinicSiteId: seeded.siteId,
        clinicId: `${PREFIX}clinic`,
        name: "Other place",
        slug: "robina",
        displayName: "Robina",
        servesSiteRoot: false,
        isPrimary: false,
        active: true,
      },
    });
    await db().practiceGuidePlacement.createMany({
      data: [
        {
          clinicId: `${PREFIX}clinic`,
          locationId: seeded.locationId,
          practiceGuideId: visible.id,
          publicSlug: "visible",
          isEnabled: true,
        },
        {
          clinicId: `${PREFIX}clinic`,
          locationId: otherLocation.id,
          practiceGuideId: hidden.id,
          publicSlug: "hidden",
          isEnabled: true,
        },
      ],
    });

    const listed = await listPublishedPracticeGuides(SITE_SLUG);
    expect(listed?.guides.map((guide) => guide.publicSlug)).toEqual([
      "visible",
    ]);
    await expect(
      getPublishedPracticeGuide({
        clinicSlug: OTHER_SLUG,
        publicSlug: "visible",
      })
    ).resolves.toBeNull();
  });

  it("dual-writes practice settings and rolls back both sides together", async () => {
    await seedAccount({
      id: `${PREFIX}clinic`,
      name: "Runtime Clinic",
      accountSlug: ACCOUNT_SLUG,
      siteSlug: SITE_SLUG,
      userId: `${PREFIX}user`,
    });
    const next = {
      ...settings,
      displayName: "Saved Site Brand",
      primaryColor: "#155e75",
      themeMode: "LIGHT",
      phone: "0288888888",
      addressLine1: "4 Saved Street",
      emergencyInstructions: "Saved emergency copy.",
    } satisfies PracticeSettingsInput;

    await updatePracticeSettings({
      clinicId: `${PREFIX}clinic`,
      values: next,
    });

    const site = await db().clinicSite.findUniqueOrThrow({
      where: { slug: SITE_SLUG },
    });
    const location = await db().clinicLocation.findFirstOrThrow({
      where: { clinicId: `${PREFIX}clinic`, servesSiteRoot: true },
    });
    const profile = await db().clinicProfile.findUniqueOrThrow({
      where: { clinicId: `${PREFIX}clinic` },
    });
    expect(site.displayName).toBe("Saved Site Brand");
    expect(site.primaryColor).toBe("#155e75");
    expect(site.themeMode).toBe("LIGHT");
    expect(profile.displayName).toBe("Saved Site Brand");
    expect(profile.primaryColor).toBe("#155e75");
    expect(location.phone).toBe("0288888888");
    expect(location.addressLine1).toBe("4 Saved Street");
    expect(location.emergencyInstructions).toBe("Saved emergency copy.");
    expect(profile.phone).toBe("0288888888");
    expect(profile.emergencyInstructions).toBe("Saved emergency copy.");

    const tenant = await getClinicBySlug(SITE_SLUG);
    expect(tenant?.profile?.displayName).toBe("Saved Site Brand");
    expect(tenant?.profile?.phone).toBe("0288888888");

    await expect(
      db().$transaction(async (tx) => {
        await syncPracticeSettings(tx, {
          clinicId: `${PREFIX}clinic`,
          values: {
            ...next,
            displayName: "Rolled Back Brand",
            phone: "0277777777",
          },
        });
        throw new Error("force rollback");
      })
    ).rejects.toThrow("force rollback");

    const siteAfter = await db().clinicSite.findUniqueOrThrow({
      where: { slug: SITE_SLUG },
    });
    const profileAfter = await db().clinicProfile.findUniqueOrThrow({
      where: { clinicId: `${PREFIX}clinic` },
    });
    expect(siteAfter.displayName).toBe("Saved Site Brand");
    expect(profileAfter.displayName).toBe("Saved Site Brand");
    expect(profileAfter.phone).toBe("0288888888");
  });

  it("dual-writes branding asset references", async () => {
    await seedAccount({
      id: `${PREFIX}clinic`,
      name: "Runtime Clinic",
      accountSlug: ACCOUNT_SLUG,
      siteSlug: SITE_SLUG,
      userId: `${PREFIX}user`,
    });
    const storageKey =
      "clinics/mlrt_clinic/branding/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png";
    await db().$transaction((tx) =>
      syncBrandingAssetReference(tx, {
        clinicId: `${PREFIX}clinic`,
        field: "logoUrl",
        storageKey,
      })
    );
    const site = await db().clinicSite.findUniqueOrThrow({
      where: { slug: SITE_SLUG },
    });
    const profile = await db().clinicProfile.findUniqueOrThrow({
      where: { clinicId: `${PREFIX}clinic` },
    });
    expect(site.logoUrl).toBe(storageKey);
    expect(profile.logoUrl).toBe(storageKey);
  });

  it("creates, publishes, unpublishes, and deletes the root placement only", async () => {
    const seeded = await seedAccount({
      id: `${PREFIX}clinic`,
      name: "Runtime Clinic",
      accountSlug: ACCOUNT_SLUG,
      siteSlug: SITE_SLUG,
      userId: `${PREFIX}user`,
    });
    const template = await seedTemplate();
    const fromTemplate = await createPracticeGuideFromTemplate({
      clinicId: `${PREFIX}clinic`,
      actorUserId: `${PREFIX}user`,
      values: { templateId: template.templateId },
    });
    const templatePlacement =
      await db().practiceGuidePlacement.findFirstOrThrow({
        where: { practiceGuideId: fromTemplate.id },
      });
    expect(templatePlacement.locationId).toBe(seeded.locationId);
    expect(templatePlacement.isEnabled).toBe(false);
    expect(templatePlacement.publishedPracticeGuideRevisionId).toBeNull();

    await adaptPracticeGuideFromTemplate({
      clinicId: `${PREFIX}clinic`,
      guideId: fromTemplate.id,
    });
    const adaptedPlacement = await db().practiceGuidePlacement.findFirstOrThrow(
      {
        where: { practiceGuideId: fromTemplate.id },
      }
    );
    expect(adaptedPlacement.locationId).toBe(seeded.locationId);

    const custom = await createCustomPracticeGuide({
      clinicId: `${PREFIX}clinic`,
      actorUserId: `${PREFIX}user`,
      values: { title: "Custom", publicSlug: "custom-guide" },
    });
    await savePracticeGuideDraft({
      clinicId: `${PREFIX}clinic`,
      actorUserId: `${PREFIX}user`,
      values: {
        guideId: custom.id,
        title: "Custom",
        publicSlug: "custom-renamed",
        introduction: null,
        sections: [
          {
            key: "introduction",
            kind: "INTRODUCTION",
            title: "About",
            body: "Custom body.",
            periodLabel: null,
            startDay: null,
            endDay: null,
          },
        ],
      },
    });
    const renamed = await db().practiceGuidePlacement.findFirstOrThrow({
      where: { practiceGuideId: custom.id },
    });
    expect(renamed.publicSlug).toBe("custom-renamed");

    const first = await publishPracticeGuide({
      clinicId: `${PREFIX}clinic`,
      actorUserId: `${PREFIX}user`,
      guideId: custom.id,
      reviewAttested: true,
    });
    const otherLocation = await db().clinicLocation.create({
      data: {
        clinicSiteId: seeded.siteId,
        clinicId: `${PREFIX}clinic`,
        name: "Second",
        slug: "southport",
        displayName: "Southport",
        servesSiteRoot: false,
        active: true,
      },
    });
    const rootAfterFirst = await db().practiceGuidePlacement.findFirstOrThrow({
      where: { practiceGuideId: custom.id, locationId: seeded.locationId },
    });
    await db().practiceGuidePlacement.create({
      data: {
        clinicId: `${PREFIX}clinic`,
        locationId: otherLocation.id,
        practiceGuideId: custom.id,
        publicSlug: "custom-renamed",
        isEnabled: true,
        publishedPracticeGuideRevisionId:
          rootAfterFirst.publishedPracticeGuideRevisionId,
      },
    });

    await savePracticeGuideDraft({
      clinicId: `${PREFIX}clinic`,
      actorUserId: `${PREFIX}user`,
      values: {
        guideId: custom.id,
        title: "Custom republished",
        publicSlug: "custom-renamed",
        introduction: null,
        sections: [
          {
            key: "introduction",
            kind: "INTRODUCTION",
            title: "About",
            body: "Republished body.",
            periodLabel: null,
            startDay: null,
            endDay: null,
          },
        ],
      },
    });
    const second = await publishPracticeGuide({
      clinicId: `${PREFIX}clinic`,
      actorUserId: `${PREFIX}user`,
      guideId: custom.id,
      reviewAttested: true,
    });
    expect(second.version).toBe(first.version + 1);

    const rootAfterSecond = await db().practiceGuidePlacement.findFirstOrThrow({
      where: { practiceGuideId: custom.id, locationId: seeded.locationId },
    });
    const otherAfterSecond = await db().practiceGuidePlacement.findFirstOrThrow(
      {
        where: { practiceGuideId: custom.id, locationId: otherLocation.id },
      }
    );
    expect(rootAfterSecond.isEnabled).toBe(true);
    expect(rootAfterSecond.publishedPracticeGuideRevisionId).not.toBe(
      otherAfterSecond.publishedPracticeGuideRevisionId
    );
    expect(otherAfterSecond.publishedPracticeGuideRevisionId).toBe(
      rootAfterFirst.publishedPracticeGuideRevisionId
    );

    const share = await loadPublishedGuideShareTarget({
      clinicId: `${PREFIX}clinic`,
      guideId: custom.id,
      requestHost: "app.localhost:3000",
      protocol: "http",
    });
    expect(share?.publicUrl).toBe(
      "http://mlrt-public-site.localhost:3000/custom-renamed"
    );
    expect(share?.publicUrl).not.toContain("/southport/");

    const live = await getPublishedPracticeGuide({
      clinicSlug: SITE_SLUG,
      publicSlug: "custom-renamed",
    });
    expect(live?.sections[0]?.body).toBe("Republished body.");
    expect(live?.profile?.displayName).toBe("Authoritative Site Brand");

    await unpublishPracticeGuide({
      clinicId: `${PREFIX}clinic`,
      actorUserId: `${PREFIX}user`,
      guideId: custom.id,
    });
    const rootUnpublished = await db().practiceGuidePlacement.findFirstOrThrow({
      where: { practiceGuideId: custom.id, locationId: seeded.locationId },
    });
    const otherUnpublished = await db().practiceGuidePlacement.findFirstOrThrow(
      {
        where: { practiceGuideId: custom.id, locationId: otherLocation.id },
      }
    );
    expect(rootUnpublished.isEnabled).toBe(false);
    expect(otherUnpublished.isEnabled).toBe(true);
    await expect(
      getPublishedPracticeGuide({
        clinicSlug: SITE_SLUG,
        publicSlug: "custom-renamed",
      })
    ).resolves.toBeNull();

    await expect(
      publishPracticeGuide({
        clinicId: `${PREFIX}other`,
        actorUserId: `${PREFIX}user`,
        guideId: custom.id,
        reviewAttested: true,
      })
    ).rejects.toBeInstanceOf(ClinicPortalError);

    await deletePracticeGuide({
      clinicId: `${PREFIX}clinic`,
      actorUserId: `${PREFIX}user`,
      guideId: fromTemplate.id,
    });
    await expect(
      db().practiceGuidePlacement.findFirst({
        where: { practiceGuideId: fromTemplate.id },
      })
    ).resolves.toBeNull();
  });

  it("keeps a matching account and site slug byte-for-byte in the share URL", async () => {
    const seeded = await seedAccount({
      id: `${PREFIX}same`,
      name: "Same Slug Clinic",
      accountSlug: "mlrt-same",
      siteSlug: "mlrt-same",
      userId: `${PREFIX}same_user`,
    });
    const guide = await db().practiceGuide.create({
      data: {
        clinicId: `${PREFIX}same`,
        title: "Extraction",
        publicSlug: "extraction",
        status: PracticeGuideStatus.PUBLISHED,
        isEnabled: true,
        publishedAt: new Date("2026-09-01T00:00:00.000Z"),
        contentRevisions: {
          create: {
            version: 1,
            status: GuideRevisionStatus.PUBLISHED,
            title: "Extraction",
            publishedAt: new Date("2026-09-01T00:00:00.000Z"),
            sections: {
              create: {
                key: "care",
                kind: "IMMEDIATE_CARE",
                title: "Care",
                body: "Body.",
                sortOrder: 1,
                provenance: "PRACTICE_CUSTOM",
              },
            },
          },
        },
      },
      include: { contentRevisions: true },
    });
    await db().practiceGuidePlacement.create({
      data: {
        clinicId: `${PREFIX}same`,
        locationId: seeded.locationId,
        practiceGuideId: guide.id,
        publicSlug: "extraction",
        isEnabled: true,
        publishedPracticeGuideRevisionId: guide.contentRevisions[0]?.id,
      },
    });

    const share = await loadPublishedGuideShareTarget({
      clinicId: `${PREFIX}same`,
      guideId: guide.id,
      requestHost: "app.riveraftercare.com.au",
      protocol: "https",
    });
    expect(share?.publicUrl).toBe(
      "https://mlrt-same.riveraftercare.com.au/extraction"
    );
  });
});
