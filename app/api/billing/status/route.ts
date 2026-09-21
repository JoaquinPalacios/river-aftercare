import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/auth/session";
import { loadBillingStatusState } from "@/lib/billing/billing-page";
import { isStaffAppHost } from "@/lib/tenancy/staff-app-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isStaffAppHost(request.headers.get("host"))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const auth = await getAuthContext();
  if (!auth.user || !auth.clinicMembership) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (auth.clinicMembership.source === "operator_support") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = await loadBillingStatusState(auth.clinicMembership.clinic.id);
  if (!status) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(status, {
    headers: { "Cache-Control": "no-store" },
  });
}
