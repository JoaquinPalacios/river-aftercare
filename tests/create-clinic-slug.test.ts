import "dotenv/config";

import { afterAll, describe, expect, it } from "vitest";

import {
  CARE_GUIDE_SLUG_MAX_LENGTH,
  CARE_GUIDE_SLUG_MIN_LENGTH,
} from "@/lib/aftercare/slug-rules";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { suggestGuideSlug } from "@/lib/clinics/slug-suggestion";
import { isLocalDevelopmentDatabase } from "@/lib/dev/database-target";
import {
  createOperatorClinic,
  createOperatorClinicSchema,
} from "@/lib/operator/create-operator-clinic";
import { getPrisma } from "@/lib/prisma";

const SLUG_PREFIX = "cslug5f7c-";
const local = isLocalDevelopmentDatabase(process.env.DATABASE_URL);
const describeDb = local ? describe : describe.skip;

function slugIssue(slug: string) {
  const parsed = createOperatorClinicSchema.safeParse({
    name: "Harbour Dental",
    slug,
    serviceCategories: ["DENTAL"],
  });
  expect(parsed.success).toBe(false);
  if (parsed.success) {
    return "";
  }
  const issue = parsed.error.issues.find((item) => item.path[0] === "slug");
  expect(issue).toBeDefined();
  return issue?.message ?? "";
}

describe("create clinic slug validation", () => {
  it("accepts the slug generated from Harbour Dental unchanged", () => {
    const slug = suggestGuideSlug("Harbour Dental");
    expect(slug).toBe("harbour-dental");
    const parsed = createOperatorClinicSchema.safeParse({
      name: "Harbour Dental",
      slug,
      serviceCategories: ["DENTAL"],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }
    expect(parsed.data.slug).toBe("harbour-dental");
    expect(parsed.data.name).toBe("Harbour Dental");
  });

  it("rejects slugs outside the existing length limits", () => {
    expect(slugIssue("a".repeat(CARE_GUIDE_SLUG_MIN_LENGTH - 1))).toContain(
      `>=${CARE_GUIDE_SLUG_MIN_LENGTH}`
    );
    expect(slugIssue("a".repeat(CARE_GUIDE_SLUG_MAX_LENGTH + 1))).toContain(
      `<=${CARE_GUIDE_SLUG_MAX_LENGTH}`
    );
    const generated = suggestGuideSlug(
      "Harbour Dental Aftercare Instructions For New Patients Today"
    );
    expect(generated.length).toBeLessThanOrEqual(CARE_GUIDE_SLUG_MAX_LENGTH);
    expect(
      createOperatorClinicSchema.safeParse({
        name: "Harbour Dental Aftercare Instructions For New Patients Today",
        slug: generated,
        serviceCategories: ["DENTAL"],
      }).success
    ).toBe(true);
  });

  it("rejects reserved tenant slugs without rewriting them", () => {
    expect(slugIssue("admin")).toBe(
      "That hostname is reserved by the platform."
    );
    expect(slugIssue("assets")).toBe(
      "That hostname is reserved by the platform."
    );
    expect(slugIssue("demodental")).toBe(
      "That hostname is reserved for the interactive demo."
    );
    expect(slugIssue("demo")).toBe(
      "That hostname is reserved for the interactive demo."
    );
    expect(suggestGuideSlug("Admin")).toBe("admin");
    expect(suggestGuideSlug("Admin")).not.toBe("admin-2");
    expect(suggestGuideSlug("Admin")).not.toBe("admin-site");
  });
});

describeDb("create clinic from a generated slug", () => {
  const prisma = getPrisma();

  afterAll(async () => {
    await prisma.clinic.deleteMany({
      where: { slug: { startsWith: SLUG_PREFIX } },
    });
    await prisma.$disconnect();
  });

  it("creates the clinic and primary site with the generated slug and rejects a duplicate unchanged", async () => {
    const name = "Cslug5f7c Harbour Dental";
    const slug = suggestGuideSlug(name);
    expect(slug.startsWith(SLUG_PREFIX)).toBe(true);
    expect(slug).toBe("cslug5f7c-harbour-dental");

    await prisma.clinic.deleteMany({ where: { slug } });

    const created = await createOperatorClinic({
      name,
      slug,
      serviceCategories: ["DENTAL"],
    });
    const clinic = await prisma.clinic.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        sites: { include: { serviceCategories: true } },
        profile: true,
      },
    });
    expect(clinic.slug).toBe(slug);
    expect(clinic.name).toBe(name);
    expect(clinic.profile?.displayName).toBe(name);
    expect(clinic.sites).toHaveLength(1);
    expect(clinic.sites[0]).toMatchObject({
      slug,
      name,
      displayName: name,
      isPrimary: true,
    });
    expect(
      clinic.sites[0]?.serviceCategories.map((row) => row.serviceCategory)
    ).toEqual(["DENTAL"]);

    await expect(
      createOperatorClinic({ name, slug, serviceCategories: ["DENTAL"] })
    ).rejects.toMatchObject({
      message: "That tenant slug is already in use.",
      code: "conflict",
    });
    await expect(
      createOperatorClinic({ name, slug, serviceCategories: ["DENTAL"] })
    ).rejects.toBeInstanceOf(ClinicPortalError);
    expect(await prisma.clinic.count({ where: { slug } })).toBe(1);
    expect(
      await prisma.clinic.findUnique({ where: { slug: `${slug}-2` } })
    ).toBeNull();
    expect(
      await prisma.clinicSite.findUnique({ where: { slug: `${slug}-2` } })
    ).toBeNull();
    expect(
      (await prisma.clinic.findUniqueOrThrow({ where: { slug } })).slug
    ).toBe(slug);
  });
});
