import { NextResponse } from "next/server";
import { headers } from "next/headers";

import { getAuthContext } from "@/lib/auth/session";
import { clinicProductApiBlocked } from "@/lib/billing/activation-gate";
import {
  guideQrFilename,
  parseGuideQrFormat,
} from "@/lib/clinic-portal/guide-qr";
import {
  renderGuideQrPng,
  renderGuideQrSvg,
} from "@/lib/clinic-portal/render-guide-qr";
import { loadPublishedGuideShareTarget } from "@/lib/clinic-portal/published-guide-share";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ guideId: string }> }
) {
  const auth = await getAuthContext();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!auth.clinicMembership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (await clinicProductApiBlocked(auth.clinicMembership)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const format = parseGuideQrFormat(
    new URL(request.url).searchParams.get("format")
  );
  if (!format) {
    return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
  }

  const { guideId } = await context.params;
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");

  const placementId = new URL(request.url).searchParams.get("placementId");
  const target = await loadPublishedGuideShareTarget({
    clinicId: auth.clinicMembership.clinic.id,
    guideId,
    requestHost: host,
    protocol,
    placementId,
  });

  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filename = guideQrFilename({
    clinicSlug: target.clinicSlug,
    publicSlug: target.publicSlug,
    format,
  });
  const disposition = `attachment; filename="${filename}"`;

  if (format === "svg") {
    const svg = await renderGuideQrSvg(target.publicUrl);
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Content-Disposition": disposition,
        "Cache-Control": "no-store",
      },
    });
  }

  const png = await renderGuideQrPng(target.publicUrl);
  return new NextResponse(Uint8Array.from(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": disposition,
      "Cache-Control": "no-store",
    },
  });
}
