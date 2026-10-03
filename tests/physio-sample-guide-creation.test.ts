import "dotenv/config";

import { afterAll, describe, expect, it } from "vitest";

import { createPracticeGuideFromTemplate } from "@/lib/clinic-portal/create-practice-guide";
import { isClinicPortalError } from "@/lib/clinic-portal/errors";
import { DEMO_AFTERCARE_TENANT_SLUG } from "@/lib/aftercare/demo-tenant";
import {
  PHYSIO_DEMO_CANONICAL_REVISION_ID,
  PHYSIO_DEMO_PRACTICE_GUIDE_ID,
  PHYSIO_DEMO_PUBLIC_SLUG,
  PHYSIO_DEMO_TEMPLATE_ID,
  seedPhysioDemo,
} from "@/lib/dev/physio-demo-seed";
import { getPrisma } from "@/lib/prisma";
import { withSampleCategoryLock } from "@/tests/active-sample-slot";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const describeDb = hasDatabase ? describe : describe.skip;

const ACTOR_ID = "physio_sample_create_actor";

describeDb("designated physiotherapy sample creation", () => {
  afterAll(async () => {
    if (!hasDatabase) {
      return;
    }
    await getPrisma().user.deleteMany({ where: { id: ACTOR_ID } });
  });

  it("creates exactly one clinic guide linked to the sample at home-exercise-plan", async () => {
    await withSampleCategoryLock(["PHYSIOTHERAPY"], async () => {
      const prisma = getPrisma();
      const clinic = await prisma.clinic.findFirstOrThrow({
        where: {
          slug: DEMO_AFTERCARE_TENANT_SLUG,
        },
        select: { id: true },
      });
      await prisma.user.deleteMany({ where: { id: ACTOR_ID } });
      await prisma.user.create({
        data: {
          id: ACTOR_ID,
          email: "physio-sample-create@example.test",
          name: "Physio Sample Create",
        },
      });

      try {
        await prisma.practiceGuide.deleteMany({
          where: {
            clinicId: clinic.id,
            OR: [
              { guideTemplateId: PHYSIO_DEMO_TEMPLATE_ID },
              { publicSlug: PHYSIO_DEMO_PUBLIC_SLUG },
            ],
          },
        });

        const created = await createPracticeGuideFromTemplate({
          clinicId: clinic.id,
          actorUserId: ACTOR_ID,
          values: { templateId: PHYSIO_DEMO_TEMPLATE_ID },
        });

        const guides = await prisma.practiceGuide.findMany({
          where: {
            clinicId: clinic.id,
            OR: [
              { guideTemplateId: PHYSIO_DEMO_TEMPLATE_ID },
              { publicSlug: PHYSIO_DEMO_PUBLIC_SLUG },
            ],
          },
        });
        expect(guides).toHaveLength(1);
        expect(guides[0]).toMatchObject({
          id: created.id,
          guideTemplateId: PHYSIO_DEMO_TEMPLATE_ID,
          pinnedRevisionId: PHYSIO_DEMO_CANONICAL_REVISION_ID,
          publicSlug: PHYSIO_DEMO_PUBLIC_SLUG,
          serviceCategory: "PHYSIOTHERAPY",
        });

        await expect(
          createPracticeGuideFromTemplate({
            clinicId: clinic.id,
            actorUserId: ACTOR_ID,
            values: { templateId: PHYSIO_DEMO_TEMPLATE_ID },
          })
        ).rejects.toSatisfy(
          (error: unknown) =>
            isClinicPortalError(error) && error.code === "conflict"
        );
        expect(
          await prisma.practiceGuide.count({
            where: {
              clinicId: clinic.id,
              guideTemplateId: PHYSIO_DEMO_TEMPLATE_ID,
            },
          })
        ).toBe(1);
      } finally {
        await prisma.practiceGuide.deleteMany({
          where: {
            clinicId: clinic.id,
            guideTemplateId: PHYSIO_DEMO_TEMPLATE_ID,
          },
        });
        const restored = await seedPhysioDemo(prisma, process.env);
        expect(restored.applied).toBe(true);
        const guide = await prisma.practiceGuide.findUnique({
          where: { id: PHYSIO_DEMO_PRACTICE_GUIDE_ID },
          select: { guideTemplateId: true, publicSlug: true },
        });
        expect(guide).toMatchObject({
          guideTemplateId: PHYSIO_DEMO_TEMPLATE_ID,
          publicSlug: PHYSIO_DEMO_PUBLIC_SLUG,
        });
        await prisma.user.deleteMany({ where: { id: ACTOR_ID } });
      }
    });
  });
});
