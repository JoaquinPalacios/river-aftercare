import type { ClinicMembershipRole, PlatformRole } from "@prisma/client";

export function authorizeClinicLogoMutation(input: {
  role: ClinicMembershipRole | "ADMIN" | "STAFF";
  actorClinicId: string;
  targetClinicId: string;
  platformRole?: PlatformRole | "NONE" | "OPERATOR";
}): { ok: true } | { ok: false; code: "forbidden" } {
  if (input.actorClinicId !== input.targetClinicId) {
    return { ok: false, code: "forbidden" };
  }

  if (input.platformRole === "OPERATOR") {
    return { ok: true };
  }

  if (input.role !== "ADMIN") {
    return { ok: false, code: "forbidden" };
  }

  return { ok: true };
}
