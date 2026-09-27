const BRANDING_FIELDS = ["logoUrl", "darkLogoUrl", "faviconUrl"];

export function crossOwnedBrandingFields(input) {
  const fields = [];
  for (const field of BRANDING_FIELDS) {
    if (storageKeyOwnedByClinic(input.sourceClinicId, input[field])) {
      fields.push(field);
    }
  }
  return fields;
}

export function storageKeyOwnedByClinic(clinicId, value) {
  if (!value || typeof value !== "string" || !clinicId) {
    return false;
  }
  const trimmed = value.trim();
  return (
    trimmed.startsWith(`clinics/${clinicId}/branding/`) ||
    trimmed.startsWith(`/clinic-branding/${clinicId}/`)
  );
}

/**
 * Read-only. Selects completed split destinations whose current Site branding
 * still uses a storage key owned by the source Account.
 */
export async function listCrossOwnedCompletedSplits(db) {
  const preparations = await db.clinicAccountSplitPreparation.findMany({
    where: {
      status: "COMPLETED",
      destinationClinicId: { not: null },
    },
    select: {
      id: true,
      sourceClinicId: true,
      destinationClinicId: true,
      siteDecisions: {
        where: { decision: "SPLIT" },
        select: { clinicSiteId: true },
      },
    },
  });
  const findings = [];
  for (const preparation of preparations) {
    const siteId = preparation.siteDecisions[0]?.clinicSiteId ?? null;
    if (!siteId || !preparation.destinationClinicId) {
      continue;
    }
    const site = await db.clinicSite.findUnique({
      where: { id: siteId },
      select: {
        id: true,
        clinicId: true,
        logoUrl: true,
        darkLogoUrl: true,
        faviconUrl: true,
      },
    });
    if (!site || site.clinicId !== preparation.destinationClinicId) {
      continue;
    }
    const fields = crossOwnedBrandingFields({
      sourceClinicId: preparation.sourceClinicId,
      logoUrl: site.logoUrl,
      darkLogoUrl: site.darkLogoUrl,
      faviconUrl: site.faviconUrl,
    });
    if (fields.length === 0) {
      continue;
    }
    findings.push({
      preparationId: preparation.id,
      sourceClinicId: preparation.sourceClinicId,
      destinationClinicId: preparation.destinationClinicId,
      siteId: site.id,
      fields,
    });
  }
  return findings;
}
