import "dotenv/config";

import { afterAll, describe, expect, it } from "vitest";
import {
  ClinicMembershipRole,
  GuideRevisionStatus,
  PracticeGuideStatus,
} from "@prisma/client";

import { getPublishedPracticeGuide } from "@/lib/aftercare/get-published-practice-guide";
import {
  createCustomPracticeGuide,
  createPracticeGuideFromTemplate,
} from "@/lib/clinic-portal/create-practice-guide";
import { deletePracticeGuide } from "@/lib/clinic-portal/delete-practice-guide-draft";
import { discardPracticeGuideDraftChanges } from "@/lib/clinic-portal/discard-practice-guide-draft-changes";
import { publishPracticeGuide } from "@/lib/clinic-portal/publish-practice-guide";
import { savePracticeGuideDraft } from "@/lib/clinic-portal/save-practice-guide-draft";
import { unpublishPracticeGuide } from "@/lib/clinic-portal/unpublish-practice-guide";
import { updatePracticeSettings } from "@/lib/clinic-portal/update-practice-settings";
import { listCanonicalGuideTemplates } from "@/lib/clinic-portal/list-canonical-templates";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { getClinicBySlug } from "@/lib/aftercare/get-clinic-by-slug";
import { getPrisma } from "@/lib/prisma";

const prisma = getPrisma();

const PREFIX = "test_p2a_";
const CLINIC_A_ID = `${PREFIX}clinic_a`;
const CLINIC_B_ID = `${PREFIX}clinic_b`;
const USER_ID = `${PREFIX}admin`;
const TEMPLATE_ID = `${PREFIX}tmpl`;
const REVISION_V1_ID = `${PREFIX}rev_v1`;
const REVISION_V2_ID = `${PREFIX}rev_v2`;

async function cleanup() {
  await prisma.practiceGuide.deleteMany({
    where: { clinicId: { in: [CLINIC_A_ID, CLINIC_B_ID] } },
  });
  await prisma.guideTemplateRevision.deleteMany({
    where: { id: { in: [REVISION_V1_ID, REVISION_V2_ID] } },
  });
  await prisma.guideTemplate.deleteMany({
    where: { id: TEMPLATE_ID },
  });
  await prisma.clinicProfile.deleteMany({
    where: { clinicId: { in: [CLINIC_A_ID, CLINIC_B_ID] } },
  });
  await prisma.clinic.deleteMany({
    where: { id: { in: [CLINIC_A_ID, CLINIC_B_ID] } },
  });
  await prisma.user.deleteMany({
    where: { id: USER_ID },
  });
}

describe("practice guide lifecycle and isolation", () => {
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("keeps published snapshots stable until an explicit publish", async () => {
    await cleanup();

    await prisma.user.create({
      data: {
        id: USER_ID,
        email: `${PREFIX}admin@example.test`,
        name: "Phase 2A Test Admin",
        platformRole: "NONE",
      },
    });

    await prisma.clinic.create({
      data: {
        id: CLINIC_A_ID,
        name: "Phase 2A Clinic A",
        slug: "testp2a-clinic-a",
        profile: {
          create: {
            displayName: "Clinic A Patient Brand",
            primaryColor: "#0f766e",
            phone: "0255500100",
            contactUrl: "https://a.example.test/contact",
            emergencyInstructions: "Call clinic A.",
          },
        },
      },
    });
    await prisma.clinic.create({
      data: {
        id: CLINIC_B_ID,
        name: "Phase 2A Clinic B",
        slug: "testp2a-clinic-b",
        profile: {
          create: {
            displayName: "Clinic B Patient Brand",
          },
        },
      },
    });
    await prisma.clinicMembership.create({
      data: {
        clinicId: CLINIC_A_ID,
        userId: USER_ID,
        role: ClinicMembershipRole.ADMIN,
      },
    });

    await prisma.guideTemplate.create({
      data: {
        id: TEMPLATE_ID,
        specialty: "DENTAL",
        slug: "testp2a-extraction",
        title: "Tooth Extraction",
        revisions: {
          create: {
            id: REVISION_V1_ID,
            version: 1,
            status: GuideRevisionStatus.PUBLISHED,
            publishedAt: new Date("2026-09-01"),
            reviewedAt: new Date("2026-09-01"),
            reviewedBy: "Lifecycle test reviewer",
            sections: {
              create: [
                {
                  key: "introduction",
                  kind: "INTRODUCTION",
                  title: "After your extraction",
                  body: "Canonical v1 introduction.",
                  sortOrder: 1,
                },
                {
                  key: "immediate-care",
                  kind: "RECOVERY_TIMELINE",
                  title: "Immediate care",
                  body: "Keep the site still.",
                  periodLabel: "First few hours",
                  startDay: 0,
                  endDay: 0,
                  sortOrder: 2,
                },
              ],
            },
          },
        },
      },
    });

    const fromTemplate = await createPracticeGuideFromTemplate({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      values: { templateId: TEMPLATE_ID },
    });

    await expect(
      getPublishedPracticeGuide({
        clinicSlug: "testp2a-clinic-a",
        publicSlug: "testp2a-extraction",
      })
    ).resolves.toBeNull();

    await savePracticeGuideDraft({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      values: {
        guideId: fromTemplate.id,
        title: "Tooth Extraction",
        publicSlug: "testp2a-extraction",
        introduction: "Draft introduction that must stay off the public page.",
        sections: [
          {
            key: "introduction",
            kind: "INTRODUCTION",
            title: "After your extraction",
            body: "Canonical v1 introduction.",
            periodLabel: null,
            startDay: null,
            endDay: null,
          },
          {
            key: "immediate-care",
            kind: "RECOVERY_TIMELINE",
            title: "Immediate care",
            body: "Keep the site still.",
            periodLabel: "First few hours",
            startDay: 0,
            endDay: 0,
          },
          {
            key: "day-1",
            kind: "RECOVERY_TIMELINE",
            title: "Protect the site",
            body: "Leave the site undisturbed today.",
            periodLabel: "Day 1",
            startDay: 1,
            endDay: 1,
          },
          {
            key: "days-2-3",
            kind: "RECOVERY_TIMELINE",
            title: "Early recovery",
            body: "Swelling often peaks.",
            periodLabel: "Days 2–3",
            startDay: 2,
            endDay: 3,
          },
          {
            key: "days-4-7",
            kind: "RECOVERY_TIMELINE",
            title: "Healing check",
            body: "Discomfort should settle.",
            periodLabel: "Days 4–7",
            startDay: 4,
            endDay: 7,
          },
          {
            key: "diet",
            kind: "WHAT_IS_NORMAL",
            title: "What is normal",
            body: "Mild swelling can be expected.",
            periodLabel: null,
            startDay: null,
            endDay: null,
          },
          {
            key: "warning-signs",
            kind: "WARNING_SIGNS",
            title: "When to contact us",
            body: "Call if bleeding will not slow.",
            periodLabel: null,
            startDay: null,
            endDay: null,
          },
        ],
      },
    });

    await expect(
      getPublishedPracticeGuide({
        clinicSlug: "testp2a-clinic-a",
        publicSlug: "testp2a-extraction",
      })
    ).resolves.toBeNull();

    const firstPublish = await publishPracticeGuide({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      reviewAttested: true,
      guideId: fromTemplate.id,
    });
    expect(firstPublish.version).toBe(1);

    const published = await getPublishedPracticeGuide({
      clinicSlug: "testp2a-clinic-a",
      publicSlug: "testp2a-extraction",
    });
    expect(published?.title).toBe("Tooth Extraction");
    expect(published?.revision.version).toBe(1);
    expect(published?.sections.map((section) => section.key)).toContain("diet");
    expect(
      published?.sections.find((section) => section.key === "immediate-care")
        ?.startDay
    ).toBe(0);

    await savePracticeGuideDraft({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      values: {
        guideId: fromTemplate.id,
        title: "Draft title that patients must not see yet",
        publicSlug: "testp2a-extraction",
        introduction: "Newer draft copy.",
        sections: [
          {
            key: "introduction",
            kind: "INTRODUCTION",
            title: "Changed intro",
            body: "This draft must not replace the public revision.",
            periodLabel: null,
            startDay: null,
            endDay: null,
          },
        ],
      },
    });

    const stillPinned = await getPublishedPracticeGuide({
      clinicSlug: "testp2a-clinic-a",
      publicSlug: "testp2a-extraction",
    });
    expect(stillPinned?.title).toBe("Tooth Extraction");
    expect(stillPinned?.revision.version).toBe(1);
    expect(stillPinned?.sections.map((section) => section.key)).toContain(
      "diet"
    );
    expect(
      stillPinned?.sections.find((section) => section.key === "introduction")
        ?.body
    ).toBe("Canonical v1 introduction.");

    const secondPublish = await publishPracticeGuide({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      reviewAttested: true,
      guideId: fromTemplate.id,
    });
    expect(secondPublish.version).toBe(2);

    const switched = await getPublishedPracticeGuide({
      clinicSlug: "testp2a-clinic-a",
      publicSlug: "testp2a-extraction",
    });
    expect(switched?.title).toBe("Draft title that patients must not see yet");
    expect(switched?.revision.version).toBe(2);
    expect(
      switched?.sections.find((section) => section.key === "introduction")?.body
    ).toBe("This draft must not replace the public revision.");

    await prisma.guideTemplateRevision.create({
      data: {
        id: REVISION_V2_ID,
        guideTemplateId: TEMPLATE_ID,
        version: 2,
        status: GuideRevisionStatus.PUBLISHED,
        publishedAt: new Date("2026-09-11"),
        sections: {
          create: {
            key: "introduction",
            kind: "INTRODUCTION",
            title: "Library update",
            body: "Canonical v2 that must not leak into the published clinic guide.",
            sortOrder: 1,
          },
        },
      },
    });

    const afterLibraryUpdate = await getPublishedPracticeGuide({
      clinicSlug: "testp2a-clinic-a",
      publicSlug: "testp2a-extraction",
    });
    expect(afterLibraryUpdate?.revision.version).toBe(2);
    expect(
      afterLibraryUpdate?.sections.find(
        (section) => section.key === "introduction"
      )?.body
    ).toBe("This draft must not replace the public revision.");
    expect(JSON.stringify(afterLibraryUpdate)).not.toContain("Canonical v2");

    const custom = await createCustomPracticeGuide({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      values: {
        title: "Custom socket care",
        publicSlug: "socket-care",
      },
    });

    await expect(
      getPublishedPracticeGuide({
        clinicSlug: "testp2a-clinic-a",
        publicSlug: "socket-care",
      })
    ).resolves.toBeNull();

    await publishPracticeGuide({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      reviewAttested: true,
      guideId: custom.id,
    });

    const customPublished = await getPublishedPracticeGuide({
      clinicSlug: "testp2a-clinic-a",
      publicSlug: "socket-care",
    });
    expect(customPublished?.template).toBeNull();
    expect(customPublished?.title).toBe("Custom socket care");

    await expect(
      savePracticeGuideDraft({
        clinicId: CLINIC_B_ID,
        actorUserId: USER_ID,
        values: {
          guideId: fromTemplate.id,
          title: "Cross clinic rewrite",
          publicSlug: "hacked",
          introduction: null,
          sections: [
            {
              key: "introduction",
              kind: "INTRODUCTION",
              title: "Stolen",
              body: "Clinic B must not edit clinic A.",
              periodLabel: null,
              startDay: null,
              endDay: null,
            },
          ],
        },
      })
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ClinicPortalError && error.code === "not_found"
    );

    await updatePracticeSettings({
      clinicId: CLINIC_A_ID,
      values: {
        displayName: "Clinic A After Save",
        logoUrl: "/demo/riverside-mark.svg",
        primaryColor: "#155e75",
        accentColor: "#b45309",
        neutralColor: "#f7f7f5",
        radiusPreset: "SHARP",
        typeface: null,
        instructionTerminology: "RECOVERY",
        themeMode: "LIGHT",
        allowPatientThemeToggle: true,
        useCustomDarkBranding: false,
        phone: "0255500199",
        contactUrl: "https://a.example.test/help",
        addressLine1: "1 Test Street",
        addressLine2: null,
        city: "Sydney",
        region: "NSW",
        postalCode: "2000",
        emergencyInstructions: "Updated emergency copy.",
      },
    });

    const tenant = await getClinicBySlug("testp2a-clinic-a");
    expect(tenant?.profile?.displayName).toBe("Clinic A After Save");
    expect(tenant?.profile?.primaryColor).toBe("#155e75");
    expect(tenant?.profile?.radiusPreset).toBe("SHARP");
    expect(tenant?.profile?.instructionTerminology).toBe("RECOVERY");
    expect(tenant?.profile?.themeMode).toBe("LIGHT");
    expect(tenant?.profile?.allowPatientThemeToggle).toBe(true);
    expect(tenant?.profile?.phone).toBe("0255500199");
    expect(tenant?.profile?.emergencyInstructions).toBe(
      "Updated emergency copy."
    );

    const otherTenant = await getClinicBySlug("testp2a-clinic-b");
    expect(otherTenant?.profile?.displayName).toBe("Clinic B Patient Brand");
    expect(otherTenant?.profile?.primaryColor).not.toBe("#155e75");

    const overlapping = savePracticeGuideDraft({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      values: {
        guideId: fromTemplate.id,
        title: "Overlap",
        publicSlug: "testp2a-extraction",
        introduction: null,
        sections: [
          {
            key: "early",
            kind: "RECOVERY_TIMELINE",
            title: "Early",
            body: "Early copy.",
            periodLabel: "Days 1-3",
            startDay: 1,
            endDay: 3,
          },
          {
            key: "late",
            kind: "RECOVERY_TIMELINE",
            title: "Late",
            body: "Late copy.",
            periodLabel: "Days 3-5",
            startDay: 3,
            endDay: 5,
          },
        ],
      },
    });
    await expect(overlapping).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ClinicPortalError && error.code === "invalid"
    );

    const publishedGuide = await prisma.practiceGuide.findUniqueOrThrow({
      where: { id: fromTemplate.id },
      select: { status: true },
    });
    expect(publishedGuide.status).toBe(PracticeGuideStatus.PUBLISHED);
  });
});

describe("draft delete and discard", () => {
  const PREFIX = "test_p2a2_";
  const CLINIC_A_ID = `${PREFIX}clinic_a`;
  const CLINIC_B_ID = `${PREFIX}clinic_b`;
  const USER_ID = `${PREFIX}admin`;
  const TEMPLATE_ID = `${PREFIX}tmpl`;
  const REVISION_ID = `${PREFIX}rev`;

  async function cleanup() {
    await prisma.practiceGuide.deleteMany({
      where: { clinicId: { in: [CLINIC_A_ID, CLINIC_B_ID] } },
    });
    await prisma.guideTemplateRevision.deleteMany({
      where: { id: REVISION_ID },
    });
    await prisma.guideTemplate.deleteMany({
      where: { id: TEMPLATE_ID },
    });
    await prisma.clinicProfile.deleteMany({
      where: { clinicId: { in: [CLINIC_A_ID, CLINIC_B_ID] } },
    });
    await prisma.clinic.deleteMany({
      where: { id: { in: [CLINIC_A_ID, CLINIC_B_ID] } },
    });
    await prisma.user.deleteMany({
      where: { id: USER_ID },
    });
  }

  async function seedClinics() {
    await cleanup();
    await prisma.user.create({
      data: {
        id: USER_ID,
        email: `${PREFIX}admin@example.test`,
        name: "Phase 2A.2 Test Admin",
        platformRole: "NONE",
      },
    });
    await prisma.clinic.create({
      data: {
        id: CLINIC_A_ID,
        name: "Phase 2A.2 Clinic A",
        slug: "testp2a2-clinic-a",
        profile: { create: { displayName: "Clinic A" } },
      },
    });
    await prisma.clinic.create({
      data: {
        id: CLINIC_B_ID,
        name: "Phase 2A.2 Clinic B",
        slug: "testp2a2-clinic-b",
        profile: { create: { displayName: "Clinic B" } },
      },
    });
    await prisma.clinicMembership.create({
      data: {
        clinicId: CLINIC_A_ID,
        userId: USER_ID,
        role: ClinicMembershipRole.ADMIN,
      },
    });
  }

  afterAll(async () => {
    await cleanup();
  });

  it("lets ADMIN delete a never-published draft and refuses published deletion", async () => {
    await seedClinics();
    const draft = await createCustomPracticeGuide({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      values: { title: "Unpublished socket care", publicSlug: "socket-draft" },
    });

    await deletePracticeGuide({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      guideId: draft.id,
    });

    expect(
      await prisma.practiceGuide.findUnique({ where: { id: draft.id } })
    ).toBeNull();

    const published = await createCustomPracticeGuide({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      values: { title: "Published socket care", publicSlug: "socket-live" },
    });
    await publishPracticeGuide({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      reviewAttested: true,
      guideId: published.id,
    });

    await expect(
      deletePracticeGuide({
        clinicId: CLINIC_A_ID,
        actorUserId: USER_ID,
        guideId: published.id,
      })
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ClinicPortalError && error.code === "conflict"
    );
    expect(
      await prisma.practiceGuide.findUnique({ where: { id: published.id } })
    ).not.toBeNull();
  });

  it("refuses cross-clinic delete and restores published drafts without unpinning", async () => {
    await seedClinics();
    const guide = await createCustomPracticeGuide({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      values: { title: "Public pin", publicSlug: "public-pin" },
    });
    await savePracticeGuideDraft({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      values: {
        guideId: guide.id,
        title: "Public pin",
        publicSlug: "public-pin",
        introduction: "Published intro.",
        sections: [
          {
            key: "introduction",
            kind: "INTRODUCTION",
            title: "After treatment",
            body: "Published body.",
            periodLabel: null,
            startDay: null,
            endDay: null,
          },
        ],
      },
    });
    await publishPracticeGuide({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      reviewAttested: true,
      guideId: guide.id,
    });

    await savePracticeGuideDraft({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      values: {
        guideId: guide.id,
        title: "Draft title patients must not see",
        publicSlug: "public-pin",
        introduction: "Draft intro.",
        sections: [
          {
            key: "introduction",
            kind: "INTRODUCTION",
            title: "Changed intro",
            body: "Draft body that must be discarded.",
            periodLabel: null,
            startDay: null,
            endDay: null,
          },
        ],
      },
    });

    await expect(
      deletePracticeGuide({
        clinicId: CLINIC_B_ID,
        actorUserId: USER_ID,
        guideId: guide.id,
      })
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ClinicPortalError && error.code === "not_found"
    );

    await discardPracticeGuideDraftChanges({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      guideId: guide.id,
    });

    const publicDoc = await getPublishedPracticeGuide({
      clinicSlug: "testp2a2-clinic-a",
      publicSlug: "public-pin",
    });
    expect(publicDoc?.title).toBe("Public pin");
    expect(
      publicDoc?.sections.find((section) => section.key === "introduction")
        ?.body
    ).toBe("Published body.");

    const draft = await prisma.practiceGuideRevision.findFirst({
      where: { practiceGuideId: guide.id, version: 0 },
      include: { sections: true },
    });
    expect(draft?.title).toBe("Public pin");
    expect(draft?.sections[0]?.body).toBe("Published body.");
  });

  it("unpublishes the public pin, keeps history, and allows republish", async () => {
    await seedClinics();
    const guide = await createCustomPracticeGuide({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      values: { title: "Public pin", publicSlug: "public-unpublish" },
    });
    await savePracticeGuideDraft({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      values: {
        guideId: guide.id,
        title: "Public pin",
        publicSlug: "public-unpublish",
        introduction: "Published intro.",
        sections: [
          {
            key: "introduction",
            kind: "INTRODUCTION",
            title: "After treatment",
            body: "Published body.",
            periodLabel: null,
            startDay: null,
            endDay: null,
          },
        ],
      },
    });
    const published = await publishPracticeGuide({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      reviewAttested: true,
      guideId: guide.id,
    });
    expect(published.version).toBe(1);

    const live = await getPublishedPracticeGuide({
      clinicSlug: "testp2a2-clinic-a",
      publicSlug: "public-unpublish",
    });
    expect(live?.title).toBe("Public pin");

    await expect(
      unpublishPracticeGuide({
        clinicId: CLINIC_B_ID,
        actorUserId: USER_ID,
        guideId: guide.id,
      })
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ClinicPortalError && error.code === "not_found"
    );

    await unpublishPracticeGuide({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      guideId: guide.id,
    });

    expect(
      await getPublishedPracticeGuide({
        clinicSlug: "testp2a2-clinic-a",
        publicSlug: "public-unpublish",
      })
    ).toBeNull();

    const unpublished = await prisma.practiceGuide.findUnique({
      where: { id: guide.id },
      include: { contentRevisions: true },
    });
    expect(unpublished?.status).toBe(PracticeGuideStatus.UNPUBLISHED);
    expect(unpublished?.isEnabled).toBe(false);
    expect(unpublished?.contentRevisions).toHaveLength(2);
    expect(
      unpublished?.contentRevisions.some(
        (revision) =>
          revision.status === GuideRevisionStatus.PUBLISHED &&
          revision.version === 1
      )
    ).toBe(true);
    expect(
      unpublished?.contentRevisions.some((revision) => revision.version === 0)
    ).toBe(true);

    const republished = await publishPracticeGuide({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      reviewAttested: true,
      guideId: guide.id,
    });
    expect(republished.version).toBe(2);

    const restored = await getPublishedPracticeGuide({
      clinicSlug: "testp2a2-clinic-a",
      publicSlug: "public-unpublish",
    });
    expect(restored?.title).toBe("Public pin");
    expect(restored?.revision.version).toBe(2);
  });

  it("lets ADMIN delete unpublished guides and leaves canonical templates intact", async () => {
    await seedClinics();
    const guide = await createCustomPracticeGuide({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      values: { title: "Soon deleted", publicSlug: "soon-deleted" },
    });
    await savePracticeGuideDraft({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      values: {
        guideId: guide.id,
        title: "Soon deleted",
        publicSlug: "soon-deleted",
        introduction: "Published intro.",
        sections: [
          {
            key: "introduction",
            kind: "INTRODUCTION",
            title: "After treatment",
            body: "Published body.",
            periodLabel: null,
            startDay: null,
            endDay: null,
          },
        ],
      },
    });
    await publishPracticeGuide({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      reviewAttested: true,
      guideId: guide.id,
    });

    await expect(
      deletePracticeGuide({
        clinicId: CLINIC_A_ID,
        actorUserId: USER_ID,
        guideId: guide.id,
      })
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ClinicPortalError && error.code === "conflict"
    );

    await unpublishPracticeGuide({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      guideId: guide.id,
    });
    await deletePracticeGuide({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      guideId: guide.id,
    });

    expect(
      await prisma.practiceGuide.findUnique({ where: { id: guide.id } })
    ).toBeNull();
    expect(
      await getPublishedPracticeGuide({
        clinicSlug: "testp2a2-clinic-a",
        publicSlug: "soon-deleted",
      })
    ).toBeNull();
  });

  it("deletes a template-backed practice guide without deleting the canonical template", async () => {
    await seedClinics();
    await prisma.guideTemplate.create({
      data: {
        id: TEMPLATE_ID,
        slug: "testp2a2-extraction",
        title: "Canonical extraction",
        specialty: "DENTAL",
        isActive: true,
        revisions: {
          create: {
            id: REVISION_ID,
            version: 1,
            status: GuideRevisionStatus.PUBLISHED,
            publishedAt: new Date("2026-09-01"),
            reviewedAt: new Date("2026-09-01"),
            reviewedBy: "Lifecycle test reviewer",
            sections: {
              create: {
                key: "introduction",
                kind: "INTRODUCTION",
                title: "After extraction",
                body: "Canonical body.",
                sortOrder: 1,
              },
            },
          },
        },
      },
    });

    const created = await createPracticeGuideFromTemplate({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      values: { templateId: TEMPLATE_ID },
    });
    const listedBefore = await listCanonicalGuideTemplates(CLINIC_A_ID);
    expect(
      listedBefore.templates.find((template) => template.id === TEMPLATE_ID)
        ?.alreadyEnabled
    ).toBe(true);

    await deletePracticeGuide({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      guideId: created.id,
    });

    expect(
      await prisma.practiceGuide.findUnique({ where: { id: created.id } })
    ).toBeNull();
    expect(
      await prisma.guideTemplate.findUnique({ where: { id: TEMPLATE_ID } })
    ).not.toBeNull();
    expect(
      await prisma.guideTemplateRevision.findUnique({
        where: { id: REVISION_ID },
      })
    ).not.toBeNull();

    const listedAfter = await listCanonicalGuideTemplates(CLINIC_A_ID);
    expect(
      listedAfter.templates.find((template) => template.id === TEMPLATE_ID)
        ?.alreadyEnabled
    ).toBe(false);

    const recreated = await createPracticeGuideFromTemplate({
      clinicId: CLINIC_A_ID,
      actorUserId: USER_ID,
      values: { templateId: TEMPLATE_ID },
    });
    expect(recreated.id).not.toBe(created.id);
  });
});
