import { NextResponse } from "next/server";

import {
  HEALTH_CACHE_CONTROL,
  HEALTH_DATABASE_UNAVAILABLE_EVENT,
  HEALTH_OK_BODY,
  HEALTH_UNAVAILABLE_BODY,
} from "@/lib/health/contract";
import { pingApplicationDatabase } from "@/lib/health/ping-application-database";
import { isStaffAppHost } from "@/lib/tenancy/staff-app-origin";

export const dynamic = "force-dynamic";

const JSON_HEADERS = {
  "Cache-Control": HEALTH_CACHE_CONTROL,
};

function json(
  body: typeof HEALTH_OK_BODY | typeof HEALTH_UNAVAILABLE_BODY,
  status: number
) {
  return NextResponse.json(body, { status, headers: JSON_HEADERS });
}

export async function GET(request: Request) {
  if (!isStaffAppHost(request.headers.get("host"))) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    await pingApplicationDatabase();
    return json(HEALTH_OK_BODY, 200);
  } catch {
    console.info({ event: HEALTH_DATABASE_UNAVAILABLE_EVENT });
    return json(HEALTH_UNAVAILABLE_BODY, 503);
  }
}

export async function HEAD(request: Request) {
  const response = await GET(request);
  return new NextResponse(null, {
    status: response.status,
    headers: response.headers,
  });
}
