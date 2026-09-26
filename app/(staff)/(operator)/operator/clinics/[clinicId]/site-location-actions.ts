"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { requirePlatformOperator } from "@/lib/auth/require-platform-operator";
import {
  deactivateClinicSite,
  reactivateClinicSite,
} from "@/lib/clinics/site-location-mutations";
import { isClinicPortalError } from "@/lib/clinic-portal/errors";
import { parseOperatorExtraAllowance } from "@/lib/entitlements/allowance-input";
import {
  updateOperatorGroupComplimentaryCapacity,
  updateOperatorSiteLocationAllowance,
} from "@/lib/operator/update-site-location-allowance";
import { isStaffAppHost } from "@/lib/tenancy/staff-app-origin";

export interface SiteCapacityActionState {
  error?: string;
  success?: string;
}

async function operatorClinicId(formData: FormData): Promise<string> {
  const host = (await headers()).get("host");
  if (!isStaffAppHost(host)) {
    notFound();
  }
  await requirePlatformOperator();
  const clinicId = formData.get("clinicId");
  if (typeof clinicId !== "string" || clinicId.length === 0) {
    notFound();
  }
  return clinicId;
}

function wholeNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function updateSiteLocationAllowanceAction(
  _previous: SiteCapacityActionState,
  formData: FormData
): Promise<SiteCapacityActionState> {
  const clinicId = await operatorClinicId(formData);
  if (formData.get("capacityKind") === "group-extras") {
    const extraSiteAllowance = parseOperatorExtraAllowance(
      formData.get("extraSiteAllowance")
    );
    const extraLocationAllowance = parseOperatorExtraAllowance(
      formData.get("extraLocationAllowance")
    );
    if (extraSiteAllowance === null || extraLocationAllowance === null) {
      return { error: "Enter a whole number of zero or more." };
    }
    const result = await updateOperatorGroupComplimentaryCapacity({
      clinicId,
      extraSiteAllowance,
      extraLocationAllowance,
    });
    if (!result.ok) {
      return { error: result.error };
    }
    revalidatePath(`/operator/clinics/${clinicId}`);
    revalidatePath("/practice/sites");
    return {
      success: result.commerciallyActive
        ? "Complimentary capacity saved. Effective totals are derived. This does not charge or refund the customer."
        : "Complimentary extras saved. Effective capacity stays unchanged until the entitlement is active. This does not charge or refund the customer.",
    };
  }

  const siteAllowance = wholeNumber(formData.get("siteAllowance"));
  const locationAllowance = wholeNumber(formData.get("locationAllowance"));
  if (siteAllowance === null || locationAllowance === null) {
    return {
      error:
        "Site and location allowances must be whole numbers of at least 1.",
    };
  }
  const result = await updateOperatorSiteLocationAllowance({
    clinicId,
    siteAllowance,
    locationAllowance,
  });
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath(`/operator/clinics/${clinicId}`);
  revalidatePath("/practice/sites");
  return {
    success: "Capacity saved. This does not charge or refund the customer.",
  };
}

export async function setOperatorSiteActiveAction(
  _previous: SiteCapacityActionState,
  formData: FormData
): Promise<SiteCapacityActionState> {
  const clinicId = await operatorClinicId(formData);
  const siteId = formData.get("siteId");
  const active = formData.get("active") === "true";
  if (typeof siteId !== "string" || siteId.length === 0) {
    return { error: "Clinic site not found." };
  }
  try {
    if (active) {
      await reactivateClinicSite({ clinicId, siteId });
    } else {
      await deactivateClinicSite({ clinicId, siteId });
    }
  } catch (error) {
    return {
      error: isClinicPortalError(error)
        ? error.message
        : "Could not update the clinic site.",
    };
  }
  revalidatePath(`/operator/clinics/${clinicId}`);
  revalidatePath("/practice/sites");
  return {
    success: active
      ? "Clinic site reactivated. No billing change was made."
      : "Clinic site deactivated. Its address no longer resolves. No billing change was made.",
  };
}
