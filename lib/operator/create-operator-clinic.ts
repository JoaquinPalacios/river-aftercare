import { Prisma } from "@prisma/client";
import { z } from "zod";

import { isDemoTenant } from "@/lib/aftercare/demo-tenant";
import { careGuideSlugSchema } from "@/lib/aftercare/slug";
import {
  primaryClinicSiteData,
  rootClinicLocationData,
} from "@/lib/clinics/primary-site-location.mjs";
import { ClinicPortalError } from "@/lib/clinic-portal/errors";
import { isReservedTenantSlug } from "@/lib/tenancy/reserved-slugs";
import { getPrisma } from "@/lib/prisma";

export const DEMO_TENANT_SLUG_RESERVED_MESSAGE =
  "That hostname is reserved for the interactive demo.";

export const createOperatorClinicSchema = z.object({
  name: z.string().trim().min(1, "Enter the practice name.").max(80),
  slug: careGuideSlugSchema
    .refine((value) => !isReservedTenantSlug(value), {
      message: "That hostname is reserved by the platform.",
    })
    .refine((value) => !isDemoTenant(value), {
      message: DEMO_TENANT_SLUG_RESERVED_MESSAGE,
    }),
});

export type CreateOperatorClinicInput = z.infer<
  typeof createOperatorClinicSchema
>;

export async function createOperatorClinic(
  values: CreateOperatorClinicInput
): Promise<{ id: string }> {
  if (isReservedTenantSlug(values.slug) || isDemoTenant(values.slug)) {
    throw new ClinicPortalError(
      isDemoTenant(values.slug)
        ? DEMO_TENANT_SLUG_RESERVED_MESSAGE
        : "That hostname is reserved by the platform.",
      "invalid"
    );
  }

  const profile = { displayName: values.name };

  try {
    return await getPrisma().$transaction(async (tx) => {
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
          profile: {
            create: profile,
          },
        },
        select: { id: true },
      });
      const site = await tx.clinicSite.create({
        data: primaryClinicSiteData({
          clinicId: clinic.id,
          clinicName: values.name,
          slug: values.slug,
          profile,
        }),
        select: { id: true },
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
