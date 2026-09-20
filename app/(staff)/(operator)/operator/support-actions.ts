"use server";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import {
  clearOperatorSupportClinicCookie,
  setOperatorSupportClinicCookie,
} from "@/lib/auth/operator-support-clinic";
import { getPrisma } from "@/lib/prisma";
import { isStaffAppHost } from "@/lib/tenancy/staff-app-origin";

async function requireOperatorOnStaffHost() {
  const host = (await headers()).get("host");
  if (!isStaffAppHost(host)) {
    notFound();
  }
  return requirePlatformOperator();
}

export async function startOperatorClinicSupportAction(formData: FormData) {
  await requireOperatorOnStaffHost();
  const clinicId =
    typeof formData.get("clinicId") === "string"
      ? String(formData.get("clinicId"))
      : "";
  if (!clinicId) {
    notFound();
  }

  const clinic = await getPrisma().clinic.findUnique({
    where: { id: clinicId },
    select: { id: true },
  });
  if (!clinic) {
    notFound();
  }

  await setOperatorSupportClinicCookie(clinic.id);
  redirect("/dashboard");
}

export async function stopOperatorClinicSupportAction() {
  await requireOperatorOnStaffHost();
  await clearOperatorSupportClinicCookie();
  redirect("/operator/clinics");
}
