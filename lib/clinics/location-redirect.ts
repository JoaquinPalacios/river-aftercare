import "server-only";

import type { Prisma } from "@prisma/client";

import { isValidCareGuideSlug } from "@/lib/aftercare/slug";
import { getClinicBySlug } from "@/lib/aftercare/get-clinic-by-slug";
import { isReservedLocationSlug } from "@/lib/clinics/reserved-location-slugs";
import { isUniqueConstraintError } from "@/lib/clinics/prisma-errors";
import { isReservedTenantSlug } from "@/lib/tenancy/reserved-slugs";
import { getPrisma } from "@/lib/prisma";

/**
 * Low-level insert for a Location cutover transaction.
 * LOCATION_TO_NEW_ACCOUNT calls this inside the structural transaction.
 * A Clinic Site split does not. Database only. No network.
 * The caller owns the PostgreSQL transaction.
 */

export class ClinicLocationRedirectError extends Error {
  readonly code: "invalid" | "conflict";

  constructor(message: string, code: "invalid" | "conflict") {
    super(message);
    this.name = "ClinicLocationRedirectError";
    this.code = code;
  }
}

export interface ClinicLocationRedirectRecord {
  id: string;
  sourceClinicSiteId: string;
  fromSlug: string;
  destinationClinicSiteId: string;
  preparationId: string | null;
}

export interface ResolvedClinicLocationRedirect {
  sourceClinicSiteId: string;
  fromSlug: string;
  destinationClinicSiteId: string;
  destinationClinicSiteSlug: string;
  destinationClinicId: string;
}

type RedirectDb = Prisma.TransactionClient;

function invalid(message: string): ClinicLocationRedirectError {
  return new ClinicLocationRedirectError(message, "invalid");
}

function conflict(message: string): ClinicLocationRedirectError {
  return new ClinicLocationRedirectError(message, "conflict");
}

function assertRedirectSlug(fromSlug: string): void {
  if (!isValidCareGuideSlug(fromSlug) || isReservedLocationSlug(fromSlug)) {
    throw invalid(
      "Enter a location address using lowercase letters, numbers, and hyphens."
    );
  }
}

/**
 * Inserts one retired-location mapping, or returns the existing row when the
 * source site, slug, and destination site already match.
 * A different destination for that source site and slug conflicts.
 * Does not update preparationId on retry.
 */
export async function createClinicLocationRedirect(input: {
  tx: RedirectDb;
  preparationId: string;
  sourceClinicSiteId: string;
  fromSlug: string;
  destinationClinicSiteId: string;
}): Promise<ClinicLocationRedirectRecord> {
  assertRedirectSlug(input.fromSlug);
  if (input.sourceClinicSiteId === input.destinationClinicSiteId) {
    throw invalid("A location redirect must move to a different clinic site.");
  }

  const [preparation, source, destination] = await Promise.all([
    input.tx.clinicAccountSplitPreparation.findUnique({
      where: { id: input.preparationId },
      select: { id: true },
    }),
    input.tx.clinicSite.findUnique({
      where: { id: input.sourceClinicSiteId },
      select: { id: true },
    }),
    input.tx.clinicSite.findUnique({
      where: { id: input.destinationClinicSiteId },
      select: { id: true },
    }),
  ]);
  if (!preparation) {
    throw invalid("That preparation was not found.");
  }
  if (!source || !destination) {
    throw invalid("Clinic site not found.");
  }

  const existing = await input.tx.clinicLocationRedirect.findUnique({
    where: {
      sourceClinicSiteId_fromSlug: {
        sourceClinicSiteId: input.sourceClinicSiteId,
        fromSlug: input.fromSlug,
      },
    },
    select: {
      id: true,
      sourceClinicSiteId: true,
      fromSlug: true,
      destinationClinicSiteId: true,
      preparationId: true,
    },
  });
  if (existing) {
    if (existing.destinationClinicSiteId === input.destinationClinicSiteId) {
      return existing;
    }
    throw conflict(
      "This location address already redirects to a different clinic site."
    );
  }

  try {
    return await input.tx.clinicLocationRedirect.create({
      data: {
        preparationId: input.preparationId,
        sourceClinicSiteId: input.sourceClinicSiteId,
        fromSlug: input.fromSlug,
        destinationClinicSiteId: input.destinationClinicSiteId,
      },
      select: {
        id: true,
        sourceClinicSiteId: true,
        fromSlug: true,
        destinationClinicSiteId: true,
        preparationId: true,
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
    const raced = await input.tx.clinicLocationRedirect.findUnique({
      where: {
        sourceClinicSiteId_fromSlug: {
          sourceClinicSiteId: input.sourceClinicSiteId,
          fromSlug: input.fromSlug,
        },
      },
      select: {
        id: true,
        sourceClinicSiteId: true,
        fromSlug: true,
        destinationClinicSiteId: true,
        preparationId: true,
      },
    });
    if (
      raced &&
      raced.destinationClinicSiteId === input.destinationClinicSiteId
    ) {
      return raced;
    }
    throw conflict(
      "This location address already redirects to a different clinic site."
    );
  }
}

/**
 * One lookup: source site plus retired slug.
 * Returns the destination site identity when that site still passes public
 * tenant routing. Does not build a URL and does not follow another redirect.
 */
export async function resolveClinicLocationRedirect(input: {
  sourceClinicSiteId: string;
  fromSlug: string;
}): Promise<ResolvedClinicLocationRedirect | null> {
  if (
    !isValidCareGuideSlug(input.fromSlug) ||
    isReservedLocationSlug(input.fromSlug)
  ) {
    return null;
  }

  const row = await getPrisma().clinicLocationRedirect.findUnique({
    where: {
      sourceClinicSiteId_fromSlug: {
        sourceClinicSiteId: input.sourceClinicSiteId,
        fromSlug: input.fromSlug,
      },
    },
    select: {
      sourceClinicSiteId: true,
      fromSlug: true,
      destinationClinicSiteId: true,
      destinationClinicSite: {
        select: {
          id: true,
          slug: true,
          active: true,
          clinicId: true,
        },
      },
    },
  });

  const destination = row?.destinationClinicSite;
  if (
    !row ||
    row.sourceClinicSiteId !== input.sourceClinicSiteId ||
    row.fromSlug !== input.fromSlug ||
    !destination ||
    destination.id !== row.destinationClinicSiteId ||
    destination.id === row.sourceClinicSiteId ||
    !destination.active ||
    !isValidCareGuideSlug(destination.slug) ||
    isReservedTenantSlug(destination.slug)
  ) {
    return null;
  }

  const publicDestination = await getClinicBySlug(destination.slug);
  if (
    !publicDestination ||
    publicDestination.id !== destination.clinicId ||
    publicDestination.slug !== destination.slug
  ) {
    return null;
  }

  return {
    sourceClinicSiteId: row.sourceClinicSiteId,
    fromSlug: row.fromSlug,
    destinationClinicSiteId: destination.id,
    destinationClinicSiteSlug: destination.slug,
    destinationClinicId: publicDestination.id,
  };
}
