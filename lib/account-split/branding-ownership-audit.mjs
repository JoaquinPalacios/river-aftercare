const BRANDING_FIELDS = ["logoUrl", "darkLogoUrl", "faviconUrl"];

/**
 * Generated Prisma 7 client delegate names for these models.
 * `ClinicAccountSplitPreparation` is `clinicAccountSplitPreparation`.
 * A client generated before that model existed has no such property, so
 * `.findMany` throws TypeError: Cannot read properties of undefined.
 */
const AUDIT_DELEGATES = [
  ["clinicAccountSplitPreparation", "findMany"],
  ["clinicAccountSplitSiteDecision", "findMany"],
  ["clinicSite", "findMany"],
];

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
 * Fail before any query when the loaded client cannot run the audit.
 * Optional chaining would hide a stale client and must not be used.
 */
export function assertAuditClient(db) {
  if (!db || typeof db !== "object") {
    throw new Error(
      "Prisma Client is not initialized. Run pnpm db:generate and retry. The audit did not read the database."
    );
  }
  for (const [name, method] of AUDIT_DELEGATES) {
    const delegate = db[name];
    if (!delegate || typeof delegate[method] !== "function") {
      throw new Error(
        `Prisma Client delegate ${name}.${method} is unavailable. The generated client does not match prisma/schema.prisma. Run pnpm db:generate and retry. The audit did not read the database.`
      );
    }
  }
}

/**
 * Read-only. Selects completed split destinations whose current Site branding
 * still uses a storage key owned by the source Account.
 *
 * Queries are separate findMany calls. A nested relation on a missing model
 * delegate is what throws "Cannot read properties of undefined (reading 'findMany')".
 */
export async function listCrossOwnedCompletedSplits(db) {
  assertAuditClient(db);
  const preparations = await db.clinicAccountSplitPreparation.findMany({
    where: {
      status: "COMPLETED",
      destinationClinicId: { not: null },
    },
    select: {
      id: true,
      sourceClinicId: true,
      destinationClinicId: true,
    },
    orderBy: { id: "asc" },
  });
  if (preparations.length === 0) {
    return [];
  }
  const decisions = await db.clinicAccountSplitSiteDecision.findMany({
    where: {
      decision: "SPLIT",
      preparationId: { in: preparations.map((row) => row.id) },
    },
    select: {
      preparationId: true,
      clinicSiteId: true,
    },
    orderBy: [{ preparationId: "asc" }, { clinicSiteId: "asc" }],
  });
  const siteIds = [...new Set(decisions.map((row) => row.clinicSiteId))];
  if (siteIds.length === 0) {
    return [];
  }
  const sites = await db.clinicSite.findMany({
    where: { id: { in: siteIds } },
    select: {
      id: true,
      clinicId: true,
      logoUrl: true,
      darkLogoUrl: true,
      faviconUrl: true,
    },
  });
  const sitesById = new Map(sites.map((site) => [site.id, site]));
  const preparationsById = new Map(preparations.map((row) => [row.id, row]));
  const findings = [];
  for (const decision of decisions) {
    const preparation = preparationsById.get(decision.preparationId);
    const site = sitesById.get(decision.clinicSiteId);
    if (!preparation?.destinationClinicId || !site) {
      continue;
    }
    if (site.clinicId !== preparation.destinationClinicId) {
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
  findings.sort(
    (left, right) =>
      left.preparationId.localeCompare(right.preparationId) ||
      left.siteId.localeCompare(right.siteId)
  );
  return findings;
}

export function formatBrandingAuditReport(findings, targetLabel) {
  const lines = [
    "Read-only branding ownership audit.",
    `Target: ${targetLabel}`,
    `Affected completed splits: ${findings.length}`,
  ];
  for (const finding of findings) {
    lines.push(
      [
        `preparationId=${finding.preparationId}`,
        `sourceClinicId=${finding.sourceClinicId}`,
        `destinationClinicId=${finding.destinationClinicId}`,
        `siteId=${finding.siteId}`,
        `fields=${finding.fields.join(",")}`,
      ].join(" ")
    );
  }
  return `${lines.join("\n")}\n`;
}
