import "dotenv/config";
import { readFileSync } from "node:fs";

import {
  BillingStatus,
  EntitlementStatus,
  type PrismaClient,
} from "@prisma/client";
import { permanentRedirect } from "next/navigation";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getPublishedPracticeGuide } from "@/lib/aftercare/get-published-practice-guide";
import { listPublishedLocationGuides } from "@/lib/aftercare/list-published-location-guides";
import {
  destinationPathForRetiredLocation,
  resolveRetiredLocationRedirectHref,
  retiredLocationRedirectPathFromRest,
} from "@/lib/aftercare/patient-location-redirect";
import { createCustomPracticeGuide } from "@/lib/clinic-portal/create-practice-guide";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { setGuideAvailableAtLocation } from "@/lib/clinic-portal/guide-placements";
import { publishPracticeGuide } from "@/lib/clinic-portal/publish-practice-guide";
import { savePracticeGuideDraft } from "@/lib/clinic-portal/save-practice-guide-draft";
import { unpublishPracticeGuide } from "@/lib/clinic-portal/unpublish-practice-guide";
import {
  createClinicLocation,
  updateClinicLocation,
} from "@/lib/clinics/site-location-mutations";
import {
  ClinicLocationRedirectError,
  createClinicLocationRedirect,
  resolveClinicLocationRedirect,
} from "@/lib/clinics/location-redirect";
import { RETIRED_LOCATION_SLUG_MESSAGE } from "@/lib/clinics/slug-collisions";
import { getPrisma } from "@/lib/prisma";

const hostState = vi.hoisted(() => ({
  host: "lrd-src.localhost:3000",
  forwardedHost: null as string | null,
  proto: "http",
}));

vi.mock("next/headers", () => ({
  headers: async () => {
    const headers = new Headers({
      host: hostState.host,
      "x-forwarded-proto": hostState.proto,
    });
    if (hostState.forwardedHost) {
      headers.set("x-forwarded-host", hostState.forwardedHost);
    }
    return headers;
  },
}));

const PREFIX = "lrd_";

function db(): PrismaClient {
  return getPrisma();
}

function details(name: string) {
  return {
    name,
    displayName: name,
    phone: "0755550101",
    addressLine1: "1 Test Street",
    addressLine2: null,
    city: "Robina",
    region: "QLD",
    postalCode: "4226",
    country: "AU",
    contactUrl: null,
    contactEmail: null,
    bookingUrl: null,
    emergencyInstructions: `Emergency for ${name}.`,
  };
}

async function cleanup(): Promise<void> {
  await db().clinicLocationRedirect.deleteMany({
    where: {
      OR: [
        { sourceClinicSite: { clinicId: { startsWith: PREFIX } } },
        { destinationClinicSite: { clinicId: { startsWith: PREFIX } } },
      ],
    },
  });
  await db().clinic.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await db().user.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

async function seedClinic(key: string, siteSlug: string) {
  const clinicId = `${PREFIX}${key}`;
  const userId = `${PREFIX}user_${key}`;
  const siteId = `${PREFIX}site_${key}`;
  const locationId = `${PREFIX}loc_${key}`;
  await db().user.create({
    data: { id: userId, email: `${userId}@example.test`, name: key },
  });
  await db().clinic.create({
    data: {
      id: clinicId,
      name: key,
      slug: `lrd-acct-${key}`,
      profile: { create: { displayName: key } },
      memberships: { create: { userId, role: "ADMIN" } },
      entitlement: {
        create: {
          commercialPlan: "GROUP",
          billingInterval: "MONTHLY",
          billingStatus: BillingStatus.ACTIVE,
          entitlementStatus: EntitlementStatus.ACTIVE,
          siteAllowance: 3,
          locationAllowance: 5,
        },
      },
    },
  });
  await db().clinicSite.create({
    data: {
      id: siteId,
      clinicId,
      name: key,
      slug: siteSlug,
      displayName: key,
      active: true,
      isPrimary: true,
    },
  });
  await db().clinicLocation.create({
    data: {
      id: locationId,
      clinicSiteId: siteId,
      clinicId,
      name: key,
      displayName: key,
      slug: null,
      servesSiteRoot: true,
      isPrimary: true,
      active: true,
    },
  });
  return { clinicId, userId, siteId, locationId, siteSlug };
}

async function seedPreparation(
  sourceClinicId: string,
  keptClinicSiteId: string,
  userId: string
) {
  return db().clinicAccountSplitPreparation.create({
    data: {
      id: `${PREFIX}prep_${sourceClinicId}`,
      sourceClinicId,
      keptClinicSiteId,
      destinationPlan: "PRACTICE",
      destinationBillingInterval: "MONTHLY",
      preparedByUserId: userId,
    },
    select: { id: true },
  });
}

async function retire(input: {
  preparationId: string;
  sourceClinicSiteId: string;
  destinationClinicSiteId: string;
  fromSlug: string;
}) {
  return db().$transaction((tx) =>
    createClinicLocationRedirect({
      tx,
      preparationId: input.preparationId,
      sourceClinicSiteId: input.sourceClinicSiteId,
      destinationClinicSiteId: input.destinationClinicSiteId,
      fromSlug: input.fromSlug,
    })
  );
}

describe("clinic location redirects", () => {
  beforeEach(async () => {
    hostState.host = "lrd-src.localhost:3000";
    hostState.forwardedHost = null;
    hostState.proto = "http";
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("keeps one destination per source site and slug, and allows the slug elsewhere", async () => {
    const source = await seedClinic("src", "lrd-src");
    const destination = await seedClinic("dst", "lrd-dst");
    const other = await seedClinic("oth", "lrd-oth");
    const preparation = await seedPreparation(
      source.clinicId,
      source.siteId,
      source.userId
    );
    const otherPreparation = await seedPreparation(
      other.clinicId,
      other.siteId,
      other.userId
    );

    await expect(
      retire({
        preparationId: preparation.id,
        sourceClinicSiteId: source.siteId,
        destinationClinicSiteId: source.siteId,
        fromSlug: "west-end",
      })
    ).rejects.toMatchObject({
      name: "ClinicLocationRedirectError",
      code: "invalid",
    });
    await expect(
      db().clinicLocationRedirect.create({
        data: {
          sourceClinicSiteId: source.siteId,
          destinationClinicSiteId: source.siteId,
          fromSlug: "west-end",
          preparationId: preparation.id,
        },
      })
    ).rejects.toThrow();
    expect(
      await db().clinicLocationRedirect.count({
        where: { sourceClinicSite: { clinicId: { startsWith: PREFIX } } },
      })
    ).toBe(0);

    const created = await retire({
      preparationId: preparation.id,
      sourceClinicSiteId: source.siteId,
      destinationClinicSiteId: destination.siteId,
      fromSlug: "west-end",
    });
    const retried = await retire({
      preparationId: preparation.id,
      sourceClinicSiteId: source.siteId,
      destinationClinicSiteId: destination.siteId,
      fromSlug: "west-end",
    });
    expect(retried.id).toBe(created.id);
    expect(retried.preparationId).toBe(preparation.id);

    const alternate = await seedClinic("alt", "lrd-alt");
    const alternatePreparation = await seedPreparation(
      alternate.clinicId,
      alternate.siteId,
      alternate.userId
    );
    await expect(
      retire({
        preparationId: alternatePreparation.id,
        sourceClinicSiteId: source.siteId,
        destinationClinicSiteId: alternate.siteId,
        fromSlug: "west-end",
      })
    ).rejects.toMatchObject({ code: "conflict" });
    const still = await db().clinicLocationRedirect.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(still.destinationClinicSiteId).toBe(destination.siteId);

    const elsewhere = await retire({
      preparationId: otherPreparation.id,
      sourceClinicSiteId: other.siteId,
      destinationClinicSiteId: destination.siteId,
      fromSlug: "west-end",
    });
    expect(elsewhere.id).not.toBe(created.id);

    await expect(
      retire({
        preparationId: preparation.id,
        sourceClinicSiteId: source.siteId,
        destinationClinicSiteId: destination.siteId,
        fromSlug: "https://evil.example",
      })
    ).rejects.toBeInstanceOf(ClinicLocationRedirectError);
  });

  it("keeps the redirect when the preparation is removed and blocks site deletion", async () => {
    const source = await seedClinic("src", "lrd-src");
    const destination = await seedClinic("dst", "lrd-dst");
    const preparation = await seedPreparation(
      source.clinicId,
      source.siteId,
      source.userId
    );
    const created = await retire({
      preparationId: preparation.id,
      sourceClinicSiteId: source.siteId,
      destinationClinicSiteId: destination.siteId,
      fromSlug: "west-end",
    });

    await db().clinicAccountSplitPreparation.delete({
      where: { id: preparation.id },
    });
    const kept = await db().clinicLocationRedirect.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(kept.preparationId).toBeNull();
    expect(kept.fromSlug).toBe("west-end");

    const replacement = await seedPreparation(
      source.clinicId,
      source.siteId,
      source.userId
    );
    const retried = await retire({
      preparationId: replacement.id,
      sourceClinicSiteId: source.siteId,
      destinationClinicSiteId: destination.siteId,
      fromSlug: "west-end",
    });
    expect(retried.id).toBe(created.id);
    expect(
      (
        await db().clinicLocationRedirect.findUniqueOrThrow({
          where: { id: created.id },
        })
      ).preparationId
    ).toBeNull();

    await expect(
      db().clinicSite.delete({ where: { id: source.siteId } })
    ).rejects.toThrow();
    await expect(
      db().clinicSite.delete({ where: { id: destination.siteId } })
    ).rejects.toThrow();
    expect(
      await db().clinicLocationRedirect.findUnique({
        where: { id: created.id },
      })
    ).not.toBeNull();
  });

  it("resolves only the matching source site and an active public destination", async () => {
    const source = await seedClinic("src", "lrd-src");
    const destination = await seedClinic("dst", "lrd-dst");
    const other = await seedClinic("oth", "lrd-oth");
    const preparation = await seedPreparation(
      source.clinicId,
      source.siteId,
      source.userId
    );
    await retire({
      preparationId: preparation.id,
      sourceClinicSiteId: source.siteId,
      destinationClinicSiteId: destination.siteId,
      fromSlug: "west-end",
    });

    await expect(
      resolveClinicLocationRedirect({
        sourceClinicSiteId: source.siteId,
        fromSlug: "west-end",
      })
    ).resolves.toMatchObject({
      sourceClinicSiteId: source.siteId,
      fromSlug: "west-end",
      destinationClinicSiteId: destination.siteId,
      destinationClinicSiteSlug: "lrd-dst",
      destinationClinicId: destination.clinicId,
    });
    expect(destination.clinicId).not.toBe(source.clinicId);
    await expect(
      resolveClinicLocationRedirect({
        sourceClinicSiteId: source.siteId,
        fromSlug: "missing-slug",
      })
    ).resolves.toBeNull();
    await expect(
      resolveClinicLocationRedirect({
        sourceClinicSiteId: other.siteId,
        fromSlug: "west-end",
      })
    ).resolves.toBeNull();
    await expect(
      resolveClinicLocationRedirect({
        sourceClinicSiteId: source.siteId,
        fromSlug: "https://evil.example/path",
      })
    ).resolves.toBeNull();

    await db().clinicSite.update({
      where: { id: destination.siteId },
      data: { active: false },
    });
    await expect(
      resolveClinicLocationRedirect({
        sourceClinicSiteId: source.siteId,
        fromSlug: "west-end",
      })
    ).resolves.toBeNull();
    await db().clinicSite.update({
      where: { id: destination.siteId },
      data: { active: true },
    });
    await db().clinicLocation.update({
      where: { id: destination.locationId },
      data: { active: false },
    });
    await expect(
      resolveClinicLocationRedirect({
        sourceClinicSiteId: source.siteId,
        fromSlug: "west-end",
      })
    ).resolves.toBeNull();
  });

  it("redirects the three retired location shapes and leaves root print alone", async () => {
    const source = await seedClinic("src", "lrd-src");
    const destination = await seedClinic("dst", "lrd-dst");
    const preparation = await seedPreparation(
      source.clinicId,
      source.siteId,
      source.userId
    );
    await retire({
      preparationId: preparation.id,
      sourceClinicSiteId: source.siteId,
      destinationClinicSiteId: destination.siteId,
      fromSlug: "west-end",
    });

    expect(retiredLocationRedirectPathFromRest(["print"])).toBeNull();
    expect(
      retiredLocationRedirectPathFromRest(["extraction", "extra"])
    ).toBeNull();
    expect(retiredLocationRedirectPathFromRest(["../evil"])).toBeNull();
    expect(destinationPathForRetiredLocation({ kind: "landing" })).toBe("/");
    expect(
      destinationPathForRetiredLocation({
        kind: "guide",
        guideSlug: "extraction",
      })
    ).toBe("/extraction");
    expect(
      destinationPathForRetiredLocation({
        kind: "guide-print",
        guideSlug: "extraction",
      })
    ).toBe("/extraction/print");
    expect(
      destinationPathForRetiredLocation({ kind: "guide", guideSlug: "print" })
    ).toBeNull();

    await expect(
      resolveRetiredLocationRedirectHref({
        sourceSiteSlug: "lrd-src",
        fromSlug: "west-end",
        path: { kind: "landing" },
      })
    ).resolves.toBe("http://lrd-dst.localhost:3000/");
    await expect(
      resolveRetiredLocationRedirectHref({
        sourceSiteSlug: "lrd-src",
        fromSlug: "west-end",
        path: { kind: "guide", guideSlug: "extraction" },
      })
    ).resolves.toBe("http://lrd-dst.localhost:3000/extraction");
    await expect(
      resolveRetiredLocationRedirectHref({
        sourceSiteSlug: "lrd-src",
        fromSlug: "west-end",
        path: { kind: "guide-print", guideSlug: "extraction" },
      })
    ).resolves.toBe("http://lrd-dst.localhost:3000/extraction/print");
    await expect(
      resolveRetiredLocationRedirectHref({
        sourceSiteSlug: "lrd-src",
        fromSlug: "west-end",
        path: { kind: "guide", guideSlug: "print" },
      })
    ).resolves.toBeNull();
    await expect(
      resolveRetiredLocationRedirectHref({
        sourceSiteSlug: "lrd-src",
        fromSlug: "unknown-slug",
        path: { kind: "landing" },
      })
    ).resolves.toBeNull();
    await expect(
      resolveRetiredLocationRedirectHref({
        sourceSiteSlug: "lrd-oth",
        fromSlug: "west-end",
        path: { kind: "landing" },
      })
    ).resolves.toBeNull();

    const landing = await resolveRetiredLocationRedirectHref({
      sourceSiteSlug: "lrd-src",
      fromSlug: "west-end",
      path: { kind: "landing" },
    });
    expect(new URL(landing ?? "http://invalid").search).toBe("");
    expect(landing).not.toContain("west-end");
    expect(landing).not.toContain("returnTo");

    hostState.forwardedHost = "evil.example";
    await expect(
      resolveRetiredLocationRedirectHref({
        sourceSiteSlug: "lrd-src",
        fromSlug: "west-end",
        path: { kind: "guide", guideSlug: "extraction" },
      })
    ).resolves.toBeNull();
    hostState.forwardedHost = null;
    await expect(
      resolveRetiredLocationRedirectHref({
        sourceSiteSlug: "lrd-src",
        fromSlug: "west-end",
        path: {
          kind: "guide",
          guideSlug: "extraction?returnTo=https://evil.example",
        },
      })
    ).resolves.toBeNull();

    await db().clinicSite.update({
      where: { id: destination.siteId },
      data: { slug: "lrd-moved" },
    });
    await expect(
      resolveRetiredLocationRedirectHref({
        sourceSiteSlug: "lrd-src",
        fromSlug: "west-end",
        path: { kind: "guide", guideSlug: "extraction" },
      })
    ).resolves.toBe("http://lrd-moved.localhost:3000/extraction");

    await expect(
      resolveClinicLocationRedirect({
        sourceClinicSiteId: destination.siteId,
        fromSlug: "west-end",
      })
    ).resolves.toBeNull();
  });

  it("lets a live root guide and an active location win over a redirect", async () => {
    const source = await seedClinic("src", "lrd-src");
    const destination = await seedClinic("dst", "lrd-dst");
    const preparation = await seedPreparation(
      source.clinicId,
      source.siteId,
      source.userId
    );
    const guide = await createCustomPracticeGuide({
      clinicId: source.clinicId,
      actorUserId: source.userId,
      values: { title: "West", publicSlug: "west-end" },
    });
    await savePracticeGuideDraft({
      clinicId: source.clinicId,
      actorUserId: source.userId,
      values: {
        guideId: guide.id,
        title: "West",
        publicSlug: "west-end",
        introduction: null,
        sections: [
          {
            key: "introduction",
            kind: "INTRODUCTION",
            title: "About",
            body: "Root guide body.",
            periodLabel: null,
            startDay: null,
            endDay: null,
          },
        ],
      },
    });
    await publishPracticeGuide({
      clinicId: source.clinicId,
      actorUserId: source.userId,
      guideId: guide.id,
      reviewAttested: true,
    });
    await retire({
      preparationId: preparation.id,
      sourceClinicSiteId: source.siteId,
      destinationClinicSiteId: destination.siteId,
      fromSlug: "west-end",
    });

    await expect(
      resolveRetiredLocationRedirectHref({
        sourceSiteSlug: "lrd-src",
        fromSlug: "west-end",
        path: { kind: "landing" },
      })
    ).resolves.toBeNull();
    await expect(
      getPublishedPracticeGuide({
        clinicSlug: "lrd-src",
        publicSlug: "west-end",
      })
    ).resolves.toMatchObject({ practiceGuide: { publicSlug: "west-end" } });

    await unpublishPracticeGuide({
      clinicId: source.clinicId,
      actorUserId: source.userId,
      guideId: guide.id,
    });
    const location = await createClinicLocation({
      clinicId: source.clinicId,
      siteId: source.siteId,
      values: { ...details("South"), slug: "south-port" },
    });
    await retire({
      preparationId: preparation.id,
      sourceClinicSiteId: source.siteId,
      destinationClinicSiteId: destination.siteId,
      fromSlug: "south-port",
    });
    for (const path of [
      { kind: "landing" } as const,
      { kind: "guide", guideSlug: "extraction" } as const,
      { kind: "guide-print", guideSlug: "extraction" } as const,
    ]) {
      await expect(
        resolveRetiredLocationRedirectHref({
          sourceSiteSlug: "lrd-src",
          fromSlug: "south-port",
          path,
        })
      ).resolves.toBeNull();
    }
    await expect(
      listPublishedLocationGuides({
        siteSlug: "lrd-src",
        locationSlug: "south-port",
      })
    ).resolves.toMatchObject({ locationSlug: "south-port" });
    expect(location.locationId).toBeTruthy();
  });

  it("reserves a retired slug on the source site only", async () => {
    const source = await seedClinic("src", "lrd-src");
    const destination = await seedClinic("dst", "lrd-dst");
    const other = await seedClinic("oth", "lrd-oth");
    const preparation = await seedPreparation(
      source.clinicId,
      source.siteId,
      source.userId
    );
    await retire({
      preparationId: preparation.id,
      sourceClinicSiteId: source.siteId,
      destinationClinicSiteId: destination.siteId,
      fromSlug: "west-end",
    });

    await expect(
      createClinicLocation({
        clinicId: source.clinicId,
        siteId: source.siteId,
        values: { ...details("West"), slug: "west-end" },
      })
    ).rejects.toMatchObject({
      code: "retired_slug",
      message: RETIRED_LOCATION_SLUG_MESSAGE,
    });
    const otherLocation = await createClinicLocation({
      clinicId: other.clinicId,
      siteId: other.siteId,
      values: { ...details("West"), slug: "west-end" },
    });
    expect(otherLocation.locationId).toBeTruthy();

    const draft = await createCustomPracticeGuide({
      clinicId: source.clinicId,
      actorUserId: source.userId,
      values: { title: "Safe", publicSlug: "safe-guide" },
    });
    await expect(
      savePracticeGuideDraft({
        clinicId: source.clinicId,
        actorUserId: source.userId,
        values: {
          guideId: draft.id,
          title: "Safe",
          publicSlug: "west-end",
          introduction: null,
          sections: [
            {
              key: "introduction",
              kind: "INTRODUCTION",
              title: "About",
              body: "Draft body.",
              periodLabel: null,
              startDay: null,
              endDay: null,
            },
          ],
        },
      })
    ).rejects.toThrow(RETIRED_LOCATION_SLUG_MESSAGE);
    expect(
      (await db().practiceGuide.findUniqueOrThrow({ where: { id: draft.id } }))
        .publicSlug
    ).toBe("safe-guide");

    await expect(
      createCustomPracticeGuide({
        clinicId: source.clinicId,
        actorUserId: source.userId,
        values: { title: "Taken", publicSlug: "west-end" },
      })
    ).rejects.toThrow(RETIRED_LOCATION_SLUG_MESSAGE);

    const movable = await createCustomPracticeGuide({
      clinicId: source.clinicId,
      actorUserId: source.userId,
      values: { title: "Later", publicSlug: "later-guide" },
    });
    await savePracticeGuideDraft({
      clinicId: source.clinicId,
      actorUserId: source.userId,
      values: {
        guideId: movable.id,
        title: "Later",
        publicSlug: "later-guide",
        introduction: null,
        sections: [
          {
            key: "introduction",
            kind: "INTRODUCTION",
            title: "About",
            body: "Later body.",
            periodLabel: null,
            startDay: null,
            endDay: null,
          },
        ],
      },
    });
    await db().practiceGuide.update({
      where: { id: movable.id },
      data: { publicSlug: "west-end" },
    });
    await db().practiceGuidePlacement.updateMany({
      where: { practiceGuideId: movable.id },
      data: { publicSlug: "west-end" },
    });
    await expect(
      publishPracticeGuide({
        clinicId: source.clinicId,
        actorUserId: source.userId,
        guideId: movable.id,
        reviewAttested: true,
      })
    ).rejects.toThrow(RETIRED_LOCATION_SLUG_MESSAGE);
    expect(
      (
        await db().practiceGuide.findUniqueOrThrow({
          where: { id: movable.id },
        })
      ).status
    ).not.toBe("PUBLISHED");

    await db().practiceGuide.update({
      where: { id: movable.id },
      data: { publicSlug: "later-guide" },
    });
    await db().practiceGuidePlacement.updateMany({
      where: { practiceGuideId: movable.id },
      data: { publicSlug: "later-guide" },
    });
    await publishPracticeGuide({
      clinicId: source.clinicId,
      actorUserId: source.userId,
      guideId: movable.id,
      reviewAttested: true,
    });
    await unpublishPracticeGuide({
      clinicId: source.clinicId,
      actorUserId: source.userId,
      guideId: movable.id,
    });
    await db().practiceGuide.update({
      where: { id: movable.id },
      data: { publicSlug: "west-end" },
    });
    await db().practiceGuidePlacement.updateMany({
      where: { practiceGuideId: movable.id },
      data: { publicSlug: "west-end" },
    });
    await expect(
      setGuideAvailableAtLocation({
        clinicId: source.clinicId,
        guideId: movable.id,
        locationId: source.locationId,
        available: true,
      })
    ).rejects.toThrow(RETIRED_LOCATION_SLUG_MESSAGE);
    await expect(
      publishPracticeGuide({
        clinicId: source.clinicId,
        actorUserId: source.userId,
        guideId: movable.id,
        reviewAttested: true,
      })
    ).rejects.toThrow(RETIRED_LOCATION_SLUG_MESSAGE);

    const location = await createClinicLocation({
      clinicId: source.clinicId,
      siteId: source.siteId,
      values: { ...details("Kept"), slug: "kept-slug" },
    });
    await updateClinicLocation({
      clinicId: source.clinicId,
      locationId: location.locationId,
      values: details("Kept renamed"),
    });
    expect(
      (
        await db().clinicLocation.findUniqueOrThrow({
          where: { id: location.locationId },
        })
      ).slug
    ).toBe("kept-slug");

    const published = await createCustomPracticeGuide({
      clinicId: source.clinicId,
      actorUserId: source.userId,
      values: { title: "Live", publicSlug: "live-guide" },
    });
    await savePracticeGuideDraft({
      clinicId: source.clinicId,
      actorUserId: source.userId,
      values: {
        guideId: published.id,
        title: "Live",
        publicSlug: "live-guide",
        introduction: null,
        sections: [
          {
            key: "introduction",
            kind: "INTRODUCTION",
            title: "About",
            body: "Live body.",
            periodLabel: null,
            startDay: null,
            endDay: null,
          },
        ],
      },
    });
    await publishPracticeGuide({
      clinicId: source.clinicId,
      actorUserId: source.userId,
      guideId: published.id,
      reviewAttested: true,
    });
    await expect(
      createClinicLocation({
        clinicId: source.clinicId,
        siteId: source.siteId,
        values: { ...details("Live"), slug: "live-guide" },
      })
    ).rejects.toThrow(/already used by a guide/);
    await expect(
      createCustomPracticeGuide({
        clinicId: source.clinicId,
        actorUserId: source.userId,
        values: { title: "Clash", publicSlug: "kept-slug" },
      })
    ).rejects.toThrow(/already used by a location/);
  });

  it("uses a permanent framework redirect and does not create one from a site split", () => {
    const target = "http://lrd-dst.localhost:3000/extraction";
    try {
      permanentRedirect(target);
      throw new Error("expected permanentRedirect to throw");
    } catch (error) {
      expect(error).toMatchObject({
        digest: expect.stringContaining(";308;"),
      });
      expect(String((error as { digest?: string }).digest)).toContain(target);
    }

    const execute = readFileSync("lib/account-split/execute.ts", "utf8");
    const preparation = readFileSync(
      "lib/account-split/preparation.ts",
      "utf8"
    );
    const actions = readFileSync(
      "app/(staff)/(operator)/operator/clinics/[clinicId]/split/actions.ts",
      "utf8"
    );
    const proxy = readFileSync("proxy.ts", "utf8");
    const printPage = readFileSync(
      "app/(aftercare)/%5Fsites/[tenant]/[guideSlug]/print/page.tsx",
      "utf8"
    );
    const guidePage = readFileSync(
      "app/(aftercare)/%5Fsites/[tenant]/[guideSlug]/page.tsx",
      "utf8"
    );
    const nestedPage = readFileSync(
      "app/(aftercare)/%5Fsites/[tenant]/[guideSlug]/[...rest]/page.tsx",
      "utf8"
    );
    const locationUpdate = readFileSync(
      "lib/clinics/site-location-mutations.ts",
      "utf8"
    );

    for (const source of [execute, preparation, actions]) {
      expect(source).not.toContain("createClinicLocationRedirect");
      expect(source).not.toContain("clinicLocationRedirect");
    }
    expect(proxy).not.toContain("getPrisma");
    expect(proxy).not.toContain("ClinicLocationRedirect");
    expect(printPage).not.toContain("resolveRetiredLocationRedirectHref");
    expect(printPage).not.toContain("permanentRedirect");
    expect(printPage).toContain("root-guide print");
    expect(guidePage).toContain("permanentRedirect(href)");
    expect(guidePage).toContain('path: { kind: "landing" }');
    expect(nestedPage).toContain("permanentRedirect(href)");
    expect(nestedPage).toContain("retiredLocationRedirectPathFromRest");
    const updateFn = locationUpdate.slice(
      locationUpdate.indexOf("export async function updateClinicLocation"),
      locationUpdate.indexOf("export async function deactivateClinicLocation")
    );
    expect(updateFn).not.toMatch(/data:\s*\{[^}]*\bslug:/);
    expect(RETIRED_LOCATION_SLUG_MESSAGE).not.toMatch(/redirect id|cuid/i);
  });
});
