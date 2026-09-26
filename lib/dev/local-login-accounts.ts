import { ClinicMembershipRole, PlatformRole } from "@prisma/client";

export const LOCAL_CLINIC_LOGIN_ROLES = ["ADMIN", "STAFF"] as const;
export const LOCAL_LOGIN_ROLES = ["ADMIN", "STAFF", "OPERATOR"] as const;

export type LocalClinicLoginRole = (typeof LOCAL_CLINIC_LOGIN_ROLES)[number];
export type LocalLoginRole = (typeof LOCAL_LOGIN_ROLES)[number];

export interface LocalLoginAccount {
  role: LocalLoginRole;
  email: string;
  password: string;
  userId: string;
  name: string;
  emailKey: string;
  passwordKey: string;
}

export type LocalLoginSeedPlan =
  | { status: "seed"; accounts: LocalLoginAccount[] }
  | { status: "skipped"; reason: "production" | "missing" }
  | { status: "refused"; reason: string }
  | { status: "invalid"; reason: string };

const ACCOUNT_META: Record<
  LocalLoginRole,
  {
    userId: string;
    name: string;
    emailKey: string;
    passwordKey: string;
    cloudEmailKey: string;
    cloudPasswordKey: string;
  }
> = {
  ADMIN: {
    userId: "user_demo_admin",
    name: "Demo Admin",
    emailKey: "LOCAL_ADMIN_EMAIL",
    passwordKey: "LOCAL_ADMIN_PASSWORD",
    cloudEmailKey: "CLOUD_ADMIN_EMAIL",
    cloudPasswordKey: "CLOUD_ADMIN_PASSWORD",
  },
  STAFF: {
    userId: "user_demo_staff",
    name: "Demo Staff",
    emailKey: "LOCAL_STAFF_EMAIL",
    passwordKey: "LOCAL_STAFF_PASSWORD",
    cloudEmailKey: "CLOUD_STAFF_EMAIL",
    cloudPasswordKey: "CLOUD_STAFF_PASSWORD",
  },
  OPERATOR: {
    userId: "user_demo_operator",
    name: "Demo Operator",
    emailKey: "LOCAL_OPERATOR_EMAIL",
    passwordKey: "LOCAL_OPERATOR_PASSWORD",
    cloudEmailKey: "CLOUD_OPERATOR_EMAIL",
    cloudPasswordKey: "CLOUD_OPERATOR_PASSWORD",
  },
};

const PRODUCTION_CREDENTIAL_REFUSAL =
  "LOCAL_* and CLOUD_* authentication variables must not be set in production. Development accounts were not created.";

export function localLoginEnvKeys(role: LocalLoginRole): {
  emailKey: string;
  passwordKey: string;
} {
  return {
    emailKey: ACCOUNT_META[role].emailKey,
    passwordKey: ACCOUNT_META[role].passwordKey,
  };
}

function platformRoleFor(role: LocalLoginRole): PlatformRole {
  return role === "OPERATOR" ? PlatformRole.OPERATOR : PlatformRole.NONE;
}

function envPresent(value: string | undefined): boolean {
  return typeof value === "string" && value !== "";
}

function hasAnyDevelopmentLoginEnv(env: NodeJS.Dict<string>): boolean {
  return LOCAL_LOGIN_ROLES.some((role) => {
    const meta = ACCOUNT_META[role];
    return (
      envPresent(env[meta.emailKey]) ||
      envPresent(env[meta.passwordKey]) ||
      envPresent(env[meta.cloudEmailKey]) ||
      envPresent(env[meta.cloudPasswordKey])
    );
  });
}

function resolveRoleAccount(
  env: NodeJS.Dict<string>,
  role: LocalLoginRole
): { account: LocalLoginAccount | null } | { error: string } {
  const meta = ACCOUNT_META[role];
  const cloudEmailPresent = envPresent(env[meta.cloudEmailKey]);
  const cloudPasswordPresent = envPresent(env[meta.cloudPasswordKey]);

  if (cloudEmailPresent || cloudPasswordPresent) {
    const email = env[meta.cloudEmailKey]?.trim() ?? "";
    const password = env[meta.cloudPasswordKey] ?? "";
    if (!email || !password) {
      return {
        error:
          `Incomplete Cloud credentials for ${role}. Set both ${meta.cloudEmailKey} and ${meta.cloudPasswordKey}, or set neither. ` +
          `Refusing to combine Cloud and Local credentials for the same role.`,
      };
    }

    return {
      account: {
        role,
        email,
        password,
        userId: meta.userId,
        name: meta.name,
        emailKey: meta.cloudEmailKey,
        passwordKey: meta.cloudPasswordKey,
      },
    };
  }

  const email = env[meta.emailKey]?.trim() ?? "";
  const password = env[meta.passwordKey] ?? "";
  if (!email || !password) {
    return { account: null };
  }

  return {
    account: {
      role,
      email,
      password,
      userId: meta.userId,
      name: meta.name,
      emailKey: meta.emailKey,
      passwordKey: meta.passwordKey,
    },
  };
}

export function resolveLocalLoginSeed(
  env: NodeJS.Dict<string> = process.env,
  nodeEnv = env.NODE_ENV
): LocalLoginSeedPlan {
  const production = nodeEnv === "production";
  const configured = hasAnyDevelopmentLoginEnv(env);

  if (production && configured) {
    return {
      status: "refused",
      reason: PRODUCTION_CREDENTIAL_REFUSAL,
    };
  }

  if (production) {
    return { status: "skipped", reason: "production" };
  }

  const accounts: LocalLoginAccount[] = [];
  const errors: string[] = [];

  for (const role of LOCAL_LOGIN_ROLES) {
    const resolved = resolveRoleAccount(env, role);
    if ("error" in resolved) {
      errors.push(resolved.error);
      continue;
    }
    if (resolved.account) {
      accounts.push(resolved.account);
    }
  }

  if (errors.length > 0) {
    return { status: "invalid", reason: errors.join(" ") };
  }

  if (accounts.length === 0) {
    return { status: "skipped", reason: "missing" };
  }

  return { status: "seed", accounts };
}

export interface LocalLoginPrisma {
  user: {
    upsert: (args: {
      where: { id: string };
      update: {
        name: string;
        email: string;
        passwordHash: string;
        platformRole: PlatformRole;
      };
      create: {
        id: string;
        name: string;
        email: string;
        passwordHash: string;
        platformRole: PlatformRole;
      };
    }) => Promise<{ id: string; email: string }>;
  };
  clinicMembership: {
    upsert: (args: {
      where: { clinicId_userId: { clinicId: string; userId: string } };
      update: { role: ClinicMembershipRole; active: true };
      create: {
        clinicId: string;
        userId: string;
        role: ClinicMembershipRole;
        active: true;
      };
    }) => Promise<unknown>;
  };
}

export async function upsertLocalLoginAccounts(input: {
  prisma: LocalLoginPrisma;
  clinicId: string;
  accounts: LocalLoginAccount[];
  hashPassword: (password: string) => string;
}): Promise<{ id: string; email: string; role: LocalLoginRole }[]> {
  const seeded = [];

  for (const account of input.accounts) {
    const passwordHash = input.hashPassword(account.password);
    const platformRole = platformRoleFor(account.role);
    const user = await input.prisma.user.upsert({
      where: { id: account.userId },
      update: {
        name: account.name,
        email: account.email,
        passwordHash,
        platformRole,
      },
      create: {
        id: account.userId,
        name: account.name,
        email: account.email,
        passwordHash,
        platformRole,
      },
    });

    if (account.role !== "OPERATOR") {
      await input.prisma.clinicMembership.upsert({
        where: {
          clinicId_userId: {
            clinicId: input.clinicId,
            userId: user.id,
          },
        },
        update: { role: account.role, active: true },
        create: {
          clinicId: input.clinicId,
          userId: user.id,
          role: account.role,
          active: true,
        },
      });
    }

    seeded.push({ id: user.id, email: user.email, role: account.role });
  }

  return seeded;
}
