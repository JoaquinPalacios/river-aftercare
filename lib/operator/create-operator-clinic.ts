import { Prisma } from "@prisma/client";
import { z } from "zod";

import { isDemoTenant } from "@/lib/aftercare/demo-tenant";
import {
  SERVICE_CATEGORIES,
  uniqueServiceCategories,
} from "@/lib/aftercare/service-category";
import { isSharedDemoHostnameLabel } from "@/lib/tenancy/shared-demo-hostname";
import { careGuideSlugSchema } from "@/lib/aftercare/slug";
import {
  primaryClinicSiteData,
  rootClinicLocationData,
} from "@/lib/clinics/primary-site-location.mjs";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import {
  assertTenantSlugNotRetired,
  lockTenantSlugs,
} from "@/lib/clinics/retired-tenant-slug";
import { lockClinicAccountStructure } from "@/lib/entitlements/locks";
import { isReservedTenantSlug } from "@/lib/tenancy/reserved-slugs";
import { getPrisma } from "@/lib/prisma";

export const DEMO_TENANT_SLUG_RESERVED_MESSAGE =
  "That hostname is reserved for the interactive demo.";

export const OPERATOR_CLINIC_CATEGORY_REQUIRED_MESSAGE =
  "Select at least one practice category.";

export const OPERATOR_CLINIC_CATEGORY_INVALID_MESSAGE =
  "Choose a supported practice category.";

export const operatorClinicServiceCategoriesSchema = z
  .array(
    z.enum(SERVICE_CATEGORIES, {
      error: OPERATOR_CLINIC_CATEGORY_INVALID_MESSAGE,
    })
  )
  .min(1, OPERATOR_CLINIC_CATEGORY_REQUIRED_MESSAGE)
  .transform((value) => uniqueServiceCategories(value));

export const createOperatorClinicSchema = z.object({
  name: z.string().trim().min(1, "Enter the practice name.").max(80),
  slug: careGuideSlugSchema
    .refine((value) => !isReservedTenantSlug(value), {
      message: "That hostname is reserved by the platform.",
    })
    .refine(
      (value) => !isDemoTenant(value) && !isSharedDemoHostnameLabel(value),
      {
        message: DEMO_TENANT_SLUG_RESERVED_MESSAGE,
      }
    ),
  serviceCategories: operatorClinicServiceCategoriesSchema,
});

export type CreateOperatorClinicInput = z.infer<
  typeof createOperatorClinicSchema
>;

export async function createOperatorClinic(
  values: CreateOperatorClinicInput
): Promise<{ id: string }> {
  if (
    isReservedTenantSlug(values.slug) ||
    isDemoTenant(values.slug) ||
    isSharedDemoHostnameLabel(values.slug)
  ) {
    throw new ClinicPortalError(
      isDemoTenant(values.slug) || isSharedDemoHostnameLabel(values.slug)
        ? DEMO_TENANT_SLUG_RESERVED_MESSAGE
        : "That hostname is reserved by the platform.",
      "invalid"
    );
  }

  const serviceCategories = uniqueServiceCategories(values.serviceCategories);
  if (serviceCategories.length === 0) {
    throw new ClinicPortalError(
      OPERATOR_CLINIC_CATEGORY_REQUIRED_MESSAGE,
      "invalid"
    );
  }

  const profile = { displayName: values.name };

  try {
    return await getPrisma().$transaction(async (tx) => {
      await lockTenantSlugs(tx, [values.slug]);
      await assertTenantSlugNotRetired(tx, values.slug);
      const [clinicTaken, siteTaken] = await Promise.all([
        tx.clinic.findUnique({
          where: { slug: values.slug },
          select: { id: true },
        }),
        tx.clinicSite.findUnique({
          where: { slug: values.slug },
          select: { id: true },
        }),
      ]);
      if (clinicTaken || siteTaken) {
        throw new ClinicPortalError(
          "That tenant slug is already in use.",
          "conflict"
        );
      }

      const clinic = await tx.clinic.create({
        data: {
          name: values.name,
          slug: values.slug,
          assistedOnboarding: true,
          profile: {
            create: profile,
          },
        },
        select: { id: true },
      });
      await lockClinicAccountStructure(tx, clinic.id);
      const site = await tx.clinicSite.create({
        data: primaryClinicSiteData({
          clinicId: clinic.id,
          clinicName: values.name,
          slug: values.slug,
          profile,
        }),
        select: { id: true },
      });
      await tx.clinicSiteServiceCategory.createMany({
        data: serviceCategories.map((serviceCategory) => ({
          clinicSiteId: site.id,
          clinicId: clinic.id,
          serviceCategory,
        })),
      });
      await tx.clinicLocation.create({
        data: rootClinicLocationData({
          clinicId: clinic.id,
          clinicSiteId: site.id,
          clinicName: values.name,
          profile,
        }),
      });
      return clinic;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ClinicPortalError(
        "That tenant slug is already in use.",
        "conflict"
      );
    }
    throw error;
  }
}
