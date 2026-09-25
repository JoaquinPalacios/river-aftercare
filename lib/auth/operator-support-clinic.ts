import "server-only";

import { cookies } from "next/headers";

import { authSessionCookieOptions } from "@/lib/auth/session-cookie";
import { publicPracticeName } from "@/lib/clinics/patient-profile";
import { getPrisma } from "@/lib/prisma";

export const OPERATOR_SUPPORT_CLINIC_COOKIE = "river_operator_support_clinic";
export const OPERATOR_SUPPORT_MEMBERSHIP_ID = "operator-support";

export async function readOperatorSupportClinic(): Promise<{
  id: string;
  name: string;
} | null> {
  const cookieStore = await cookies();
  const clinicId = cookieStore
    .get(OPERATOR_SUPPORT_CLINIC_COOKIE)
    ?.value?.trim();
  if (!clinicId) {
    return null;
  }

  const clinic = await getPrisma().clinic.findUnique({
    where: { id: clinicId },
    select: {
      id: true,
      name: true,
      sites: {
        where: { isPrimary: true, active: true },
        select: { displayName: true, clinicId: true },
      },
    },
  });
  if (!clinic) {
    return null;
  }

  return {
    id: clinic.id,
    name: publicPracticeName({
      siteDisplayName:
        clinic.sites.length === 1 && clinic.sites[0]?.clinicId === clinic.id
          ? clinic.sites[0].displayName
          : null,
      accountName: clinic.name,
    }),
  };
}

export async function setOperatorSupportClinicCookie(clinicId: string) {
  const cookieStore = await cookies();
  cookieStore.set({
    ...authSessionCookieOptions,
    name: OPERATOR_SUPPORT_CLINIC_COOKIE,
    value: clinicId,
  });
}

export async function clearOperatorSupportClinicCookie() {
  const cookieStore = await cookies();
  cookieStore.set({
    ...authSessionCookieOptions,
    name: OPERATOR_SUPPORT_CLINIC_COOKIE,
    value: "",
    expires: new Date(0),
  });
}
