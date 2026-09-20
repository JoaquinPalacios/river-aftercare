import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  AUTH_SESSION_COOKIE_NAME,
  authSessionCookieOptions,
} from "@/lib/auth/session-cookie";
import { OPERATOR_SUPPORT_CLINIC_COOKIE } from "@/lib/auth/operator-support-clinic";
import { deleteDatabaseSession } from "@/lib/auth/session";

export async function POST() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE_NAME)?.value;

  if (sessionToken) {
    await deleteDatabaseSession(sessionToken);
  }

  const response = NextResponse.json({ success: true });

  response.cookies.set({
    ...authSessionCookieOptions,
    name: AUTH_SESSION_COOKIE_NAME,
    value: "",
    expires: new Date(0),
  });
  response.cookies.set({
    ...authSessionCookieOptions,
    name: OPERATOR_SUPPORT_CLINIC_COOKIE,
    value: "",
    expires: new Date(0),
  });

  return response;
}
