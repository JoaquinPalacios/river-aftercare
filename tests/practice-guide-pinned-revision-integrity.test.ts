import "dotenv/config";

import { Prisma } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/prisma";

const prisma = getPrisma();

const PREFIX = "test_p1a_";
const CLINIC_ID = `${PREFIX}clinic`;
const TEMPLATE_A_ID = `${PREFIX}tmpl_a`;
const TEMPLATE_B_ID = `${PREFIX}tmpl_b`;
const REVISION_A_ID = `${PREFIX}rev_a`;
const REVISION_B_ID = `${PREFIX}rev_b`;
const MATCHING_GUIDE_ID = `${PREFIX}guide_ok`;
const MISMATCH_GUIDE_ID = `${PREFIX}guide_bad`;

async function cleanup() {
  await prisma.practiceGuide.deleteMany({
    where: { id: { in: [MATCHING_GUIDE_ID, MISMATCH_GUIDE_ID] } },
  });
  await prisma.guideTemplateRevision.deleteMany({
    where: { id: { in: [REVISION_A_ID, REVISION_B_ID] } },
  });
  await prisma.guideTemplate.deleteMany({
    where: { id: { in: [TEMPLATE_A_ID, TEMPLATE_B_ID] } },
  });
  await prisma.clinic.deleteMany({
    where: { id: CLINIC_ID },
  });
}

describe("PracticeGuide pinned revision integrity", () => {
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("rejects pinning a revision that belongs to a different GuideTemplate", async () => {
    await cleanup();

    await prisma.clinic.create({
      data: {
        id: CLINIC_ID,
        name: "Integrity Test Clinic",
        slug: "testp1a-clinic",
      },
    });

    await prisma.guideTemplate.createMany({
      data: [
        {
          id: TEMPLATE_A_ID,
          serviceCategory: "DENTAL",
          slug: "testp1a-template-a",
          title: "Template A",
        },
        {
          id: TEMPLATE_B_ID,
          serviceCategory: "DENTAL",
          slug: "testp1a-template-b",
          title: "Template B",
        },
      ],
    });

    await prisma.guideTemplateRevision.createMany({
      data: [
        {
          id: REVISION_A_ID,
          guideTemplateId: TEMPLATE_A_ID,
          version: 1,
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
        {
          id: REVISION_B_ID,
          guideTemplateId: TEMPLATE_B_ID,
          version: 1,
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      ],
    });

    await expect(
      prisma.practiceGuide.create({
        data: {
          id: MISMATCH_GUIDE_ID,
          clinicId: CLINIC_ID,
          guideTemplateId: TEMPLATE_A_ID,
          pinnedRevisionId: REVISION_B_ID,
          publicSlug: "mismatched",
          title: "Mismatched",
          isEnabled: true,
          status: "PUBLISHED",
        },
      })
    ).rejects.toSatisfy((error: unknown) => {
      return (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      );
    });

    await expect(
      prisma.practiceGuide.create({
        data: {
          id: MATCHING_GUIDE_ID,
          clinicId: CLINIC_ID,
          guideTemplateId: TEMPLATE_A_ID,
          pinnedRevisionId: REVISION_A_ID,
          publicSlug: "template-a",
          title: "Template A",
          isEnabled: true,
          status: "PUBLISHED",
        },
      })
    ).resolves.toMatchObject({
      guideTemplateId: TEMPLATE_A_ID,
      pinnedRevisionId: REVISION_A_ID,
    });

    await expect(
      prisma.practiceGuide.update({
        where: { id: MATCHING_GUIDE_ID },
        data: { pinnedRevisionId: REVISION_B_ID },
      })
    ).rejects.toSatisfy((error: unknown) => {
      return (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      );
    });
  });
});
