import "dotenv/config";

import type { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PatientDemoExperience } from "@/app/(aftercare)/components/patient-demo-experience";
import {
  demoPatientGuideLede,
  demoPatientViewIds,
} from "@/lib/aftercare/demo-patient-presentation";
import { isLocalDevelopmentDatabase } from "@/lib/dev/database-target";
import {
  composedPhysioPracticeSections,
  PHYSIO_DEMO_PRACTICE_GUIDE_ID,
  PHYSIO_DEMO_PUBLIC_SLUG,
  PHYSIO_DEMO_TEMPLATE_ID,
  planPhysioDemoClinicShell,
  seedPhysioDemo,
} from "@/lib/dev/physio-demo-seed";
import { physiotherapyDemoExampleHref } from "@/lib/marketing/physio-demo-link";
import { getPrisma } from "@/lib/prisma";
import { withSampleCategoryLock } from "@/tests/active-sample-slot";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const describeDb = hasDatabase ? describe : describe.skip;

const SYNTHETIC_PRACTICE_ID = "practice_rev_physio_seed_guard";

describe("physiotherapy demo foundation", () => {
  it("keeps a home-care demonstration as one document", () => {
    expect(demoPatientViewIds(false)).toEqual(["guide"]);
    expect(demoPatientViewIds(true)).toEqual([
      "today",
      "timeline",
      "full-guide",
    ]);
    expect(
      demoPatientGuideLede({
        clinicName: "River Physio Demo",
        hasTimeline: false,
      })
    ).toBe(
      "A demonstration of written home-care guidance from River Physio Demo. This is not an individually prescribed plan."
    );
    expect(
      demoPatientGuideLede({
        clinicName: "Riverside Dental Demo",
        hasTimeline: true,
      })
    ).toBe("What matters today in your recovery from Riverside Dental Demo.");

    const homeCare = renderToStaticMarkup(
      <PatientDemoExperience
        printHref={`/${PHYSIO_DEMO_PUBLIC_SLUG}/print`}
        views={demoPatientViewIds(false).map((id) => ({
          id,
          label: "Guide",
          content: <p>Home care instructions</p>,
        }))}
      />
    );
    expect(homeCare).not.toContain('role="tablist"');
    expect(homeCare).not.toContain("Timeline");
    expect(homeCare).toContain("Home care instructions");
    expect(homeCare).toContain(`href="/${PHYSIO_DEMO_PUBLIC_SLUG}/print"`);
    expect(homeCare).toContain("Print / Save PDF");

    const timeline = renderToStaticMarkup(
      <PatientDemoExperience
        printHref="/extraction/print"
        views={demoPatientViewIds(true).map((id) => ({
          id,
          label: id,
          content: <p>{id}</p>,
        }))}
      />
    );
    expect(timeline).toContain('role="tablist"');
    expect(timeline).toContain("timeline");
  });

  it("enables the marketing example only for a verified public URL", () => {
    expect(physiotherapyDemoExampleHref({})).toBeNull();
    expect(
      physiotherapyDemoExampleHref({
        CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL: "   ",
      })
    ).toBeNull();
    expect(
      physiotherapyDemoExampleHref({
        CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL: "demophysio.riveraftercare.com.au",
      })
    ).toBeNull();
    expect(
      physiotherapyDemoExampleHref({
        CARE_GUIDE_PHYSIO_DEMO_PUBLIC_URL:
          "https://demophysio.riveraftercare.com.au/home-exercise-plan",
      })
    ).toBe("https://demophysio.riveraftercare.com.au/home-exercise-plan");
  });

  it("refuses a remote clinic shell unless production confirmation is explicit", () => {
    expect(
      planPhysioDemoClinicShell({
        local: false,
        apply: false,
        allowProduction: false,
        confirmDemoClinic: false,
        clinicExists: false,
      })
    ).toEqual({ action: "create" });
    expect(
      planPhysioDemoClinicShell({
        local: false,
        apply: true,
        allowProduction: false,
        confirmDemoClinic: false,
        clinicExists: false,
      }).action
    ).toBe("refuse");
    expect(
      planPhysioDemoClinicShell({
        local: false,
        apply: true,
        allowProduction: true,
        confirmDemoClinic: true,
        clinicExists: false,
      })
    ).toEqual({ action: "create" });
    expect(
      planPhysioDemoClinicShell({
        local: true,
        apply: true,
        allowProduction: false,
        confirmDemoClinic: false,
        clinicExists: true,
      })
    ).toEqual({
      action: "noop",
      reason: "The clinic shell already exists.",
    });
  });

  it("does not treat a remote database as local development", async () => {
    expect(isLocalDevelopmentDatabase(undefined)).toBe(false);
    expect(
      isLocalDevelopmentDatabase(
        "postgresql://postgres:postgres@localhost:5432/care_guide",
        "production"
      )
    ).toBe(false);
    expect(
      isLocalDevelopmentDatabase(
        "postgresql://user:pass@ep-example.neon.tech/neondb"
      )
    ).toBe(false);
    expect(
      isLocalDevelopmentDatabase(
        "postgresql://postgres:postgres@127.0.0.1:5432/care_guide"
      )
    ).toBe(true);

    const skipped = await seedPhysioDemo({} as PrismaClient, {
      DATABASE_URL: "postgresql://user:pass@ep-example.neon.tech/neondb",
      VERCEL_ENV: "production",
    });
    expect(skipped).toEqual({ applied: false, sampleSkipped: false });
  });

  it("composes home care without a recovery timeline", () => {
    const sections = composedPhysioPracticeSections();
    expect(sections.some((section) => section.kind === "HOME_CARE_PLAN")).toBe(
      true
    );
    expect(
      sections.some((section) => section.kind === "RECOVERY_TIMELINE")
    ).toBe(false);
    expect(
      sections.find((section) => section.key === "introduction")?.title
    ).toBe("About this demonstration");
    expect(
      sections.find((section) => section.key === "demonstration-note")?.body
    ).toContain("not individually prescribed");
    const plan = sections.find((section) => section.key === "home-care-plan");
    expect(plan?.homeCareInstructions?.map((item) => item.key)).toEqual([
      "demonstration-repetition",
      "demonstration-weekly",
    ]);
  });
});

describeDb("physiotherapy demo reseed", () => {
  afterAll(async () => {
    if (!hasDatabase) {
      return;
    }
    await withSampleCategoryLock(["PHYSIOTHERAPY"], async () => {
      const prisma = getPrisma();
      await prisma.practiceGuideRevision.deleteMany({
        where: { id: SYNTHETIC_PRACTICE_ID },
      });
    });
  });

  it("does not reset a newer published physiotherapy snapshot", async () => {
    await withSampleCategoryLock(["PHYSIOTHERAPY"], async () => {
      const prisma = getPrisma();
      const guide = await prisma.practiceGuide.findUniqueOrThrow({
        where: { id: PHYSIO_DEMO_PRACTICE_GUIDE_ID },
      });
      const placement = await prisma.practiceGuidePlacement.findFirstOrThrow({
        where: { practiceGuideId: PHYSIO_DEMO_PRACTICE_GUIDE_ID },
      });
      await prisma.practiceGuideRevision.deleteMany({
        where: { id: SYNTHETIC_PRACTICE_ID },
      });
      await prisma.practiceGuideRevision.create({
        data: {
          id: SYNTHETIC_PRACTICE_ID,
          practiceGuideId: PHYSIO_DEMO_PRACTICE_GUIDE_ID,
          version: 9,
          status: "PUBLISHED",
          title: "Physiotherapy Home Exercise Plan",
          publishedAt: new Date("2026-10-02T00:00:00.000Z"),
        },
      });

      const seeded = await seedPhysioDemo(prisma, process.env);
      const after = await prisma.practiceGuide.findUniqueOrThrow({
        where: { id: PHYSIO_DEMO_PRACTICE_GUIDE_ID },
      });
      const placementAfter =
        await prisma.practiceGuidePlacement.findFirstOrThrow({
          where: { practiceGuideId: PHYSIO_DEMO_PRACTICE_GUIDE_ID },
        });

      expect(seeded.applied).toBe(true);
      expect(seeded.sampleSkipped).toBe(false);
      expect(after.pinnedRevisionId).toBe(guide.pinnedRevisionId);
      expect(placementAfter.publishedPracticeGuideRevisionId).toBe(
        placement.publishedPracticeGuideRevisionId
      );
      expect(after.publicSlug).toBe(PHYSIO_DEMO_PUBLIC_SLUG);
      expect(after.guideTemplateId).toBe(PHYSIO_DEMO_TEMPLATE_ID);
    });
  });
});
