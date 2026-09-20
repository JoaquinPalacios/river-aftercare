import { NextResponse } from "next/server";
import { PlatformRole } from "@prisma/client";

import {
  LOGIN_EMAIL_MAX_LENGTH,
  LOGIN_PASSWORD_MAX_LENGTH,
  normalizeLoginEmail,
} from "@/lib/auth/login-input";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "@/lib/auth/password";
import {
  AUTH_SESSION_COOKIE_NAME,
  authSessionCookieOptions,
} from "@/lib/auth/session-cookie";
import { createDatabaseSession, postLoginPath } from "@/lib/auth/session";
import { getPrisma } from "@/lib/prisma";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Expected a JSON body with email and password." },
      { status: 400 }
    );
  }

  const emailInput =
    typeof (body as { email?: unknown })?.email === "string"
      ? (body as { email: string }).email
      : "";
  const password =
    typeof (body as { password?: unknown })?.password === "string"
      ? (body as { password: string }).password
      : "";

  if (password.length > LOGIN_PASSWORD_MAX_LENGTH) {
    return NextResponse.json(
      { error: "Password is too long." },
      { status: 400 }
    );
  }

  const email = normalizeLoginEmail(emailInput);

  if (email.length > LOGIN_EMAIL_MAX_LENGTH) {
    return NextResponse.json(
      { error: "Email address is too long." },
      { status: 400 }
    );
  }

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 }
    );
  }

  const user = await getPrisma().user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      passwordHash: true,
      platformRole: true,
    },
  });

  const passwordMatches = verifyPassword(
    password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH
  );

  if (!user?.passwordHash || !passwordMatches) {
    return NextResponse.json(
      { error: "Invalid credentials." },
      { status: 401 }
    );
  }

  const memberships = await getPrisma().clinicMembership.findMany({
    where: { userId: user.id, active: true },
    select: {
      clinicId: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (memberships.length === 0 && user.platformRole !== PlatformRole.OPERATOR) {
    return NextResponse.json(
      { error: "Your account does not have staff access yet." },
      { status: 403 }
    );
  }

  if (memberships.length > 1) {
    return NextResponse.json(
      {
        error:
          "Your account has multiple clinic memberships and cannot sign in to this MVP yet.",
      },
      { status: 409 }
    );
  }

  const session = await createDatabaseSession(user.id);
  const redirectTo = postLoginPath({
    platformRole: user.platformRole,
    hasClinicMembership: memberships.length === 1,
  });
  const response = NextResponse.json({
    redirectTo,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
  });

  response.cookies.set({
    ...authSessionCookieOptions,
    name: AUTH_SESSION_COOKIE_NAME,
    value: session.sessionToken,
    expires: session.expires,
  });

  return response;
}
