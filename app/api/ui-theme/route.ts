import { NextResponse } from "next/server";

import {
  PORTAL_THEME_STORAGE_KEY,
  PRODUCT_THEME_COOKIE_MAX_AGE,
  PRODUCT_THEME_COOKIE_NAME,
  parseThemePreference,
} from "@/lib/branding/theme-preference";
import { isStaffAppHost } from "@/lib/tenancy/staff-app-origin";

export async function GET(request: Request) {
  if (!isStaffAppHost(request.headers.get("host"))) {
    return new NextResponse(null, { status: 404 });
  }

  const preference = parseThemePreference(
    new URL(request.url).searchParams.get("preference")
  );
  if (!preference) {
    return new NextResponse(null, { status: 400 });
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Theme preference</title></head><body><script>try{localStorage.setItem(${JSON.stringify(PORTAL_THEME_STORAGE_KEY)},${JSON.stringify(preference)});}catch(e){}</script></body></html>`;
  const response = new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
  response.cookies.set({
    name: PRODUCT_THEME_COOKIE_NAME,
    value: preference,
    path: "/",
    maxAge: PRODUCT_THEME_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
  return response;
}
